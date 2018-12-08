const winston = require('winston');
const sessions = require('koa-session');
const send = require('koa-send');
const Router = require('koa-router');
const views = require('koa-views');
const Koa = require('koa');
const bodyparser = require('koa-bodyparser');
const { transaction } = require('objection');
const models = require('./src/models');
const middlewares = require('./src/middlewares')

const app = new Koa();

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({format: 'YYYY-MM-DDTHH:mm:ss'}),
    winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()} ${info.message}`),
  ), 
  transports: [new winston.transports.Console]
});

app.use(sessions({key: "session", signed: false}, app));
app.use(views(`${__dirname}/views`, { extension: 'ejs' }));
app.use(bodyparser())
// Catch all 404 errors and render a 404 page.
app.use(middlewares.render404('404'));
// Configure the login and home URLs.
app.use(middlewares.configure({loginURL: '/login', homeURL: '/', logger: logger}))

// Main router definition.
const router = new Router();

// Static content path. This takes any URL pointed to /public and retrieves the
// associated public static content for it.
router.get('/public/:path(.*)', (ctx) => send(ctx, ctx.params.path, {
  root: `${__dirname}/public`,
}));

// Login routes. Only allows unauthenticated people to access.
router.use('/login', middlewares.unauthenticated());
router.get('/login', ctx => ctx.render('login', { errors: {} }));
router.post('/login', async (ctx) => {
  const errors = {};
  const { password, email } = ctx.request.body;

  if (!password) errors.password = ['Password cannot be empty'];
  if (!email) errors.email = ['Email cannot be empty'];
  if (Object.keys(errors).length != 0) return ctx.render('login', { errors: errors });

  const employees = await models.Employee
    .query()
    .where('email', '=', email)
    .andWhere('password', '=', password)
    .limit(1);

  if (!employees.length) return ctx.render('login', {
    errors: { detail: 'Email and password do not match' },
  });

  const employee = employees[0];

  ctx.session.authenticated = true;
  ctx.session.employeeID = employee.employee_id
  ctx.session.name = employee.name;
  ctx.session.role = await employee.role();

  return ctx.redirect(ctx.homeURL);
});



router.use('/', middlewares.authenticated())
router.get('/', async ctx => {
  const assigned = await models.Task
    .query()
    .where('tasks.task_id', '=', models.TaskAssignment.query()
      .select('task_id')
      .where('assigned_to', '=', ctx.session.employeeID)
      .orderBy('assigned_on')
      .first()
    )
    .whereNull('completed_on')
    .joinRelation('assigned_to')
    .joinRelation('implementation')
    .joinRelation('step');
  
  const unassigned = await models.Task
    .query()
    .select(
      'tasks.task_id',
      'service.name as serviceName',
      'step.name as stepName',
      'implementation.implementation_id as implementationID',
      'client.name as clientName'
    )
    .whereNotIn('tasks.task_id', models.TaskAssignment.query()
      .distinct('task_id')
      .select()
    )
    .whereNull('completed_on')
    .joinRelation('implementation')
    .joinRelation('step')
    .joinRelation('service')
    .joinRelation('client');

  return ctx.render('tasks', {
    name: ctx.session.name,
    role: ctx.session.role,
    assigned: assigned,
    unassigned: unassigned,
  });
});

router.get('/task/:id', async ctx => {
  const task = await models.Task
    .query()
    .select(
      'tasks.task_id',
      'tasks.notes',
      'service.name as serviceName',
      'service.description as serviceDescription',
      'step.name as stepName',
      'step.description as stepDescription',
      'implementation.implementation_id as implementationID',
      'implementation.notes as implementationNotes',
      'client.name as clientName',
    )
    .where('tasks.task_id', '=', ctx.params.id)
    .joinRelation('implementation')
    .joinRelation('step')
    .joinRelation('service')
    .joinRelation('client')
    // .joinRelation('assigned_to')
    .first()
    .then(row => row);

  if (!task) return ctx.render('404');

  const assignees = await models.TaskAssignment
    .query()
    .select(
      'task_assignments.assigned_on',
      'assignee.name'
    )
    .where('task_assignments.task_id', task.task_id)
    .joinRelation('assignee');
  
  console.log(assignees);
  console.log(task);
  return ctx.render('task', {
    name: ctx.session.name,
    role: ctx.session.role,
    task: task,
  });
});

router.use('/manage', (ctx, next) => {
  if (ctx.session.role != 'manager') return ctx.redirect(ctx.homeURL);
  return next();
});

router.get('/manage', async ctx => {
  const clients = await models.Client
    .query()
    .where('managed_by', '=', ctx.session.employeeID);

  // const requests = await models.
  
  return ctx.render('manage', {
    clients: clients,
    role: ctx.session.role,
    name: ctx.session.name,
    requests: [],
  });
});

router.use('/manage/implementation', async (ctx, next) => {
  ctx.clients = await models.Client.query().where('managed_by', '=', ctx.session.employeeID);
  ctx.services = await models.Service.query();
  return next();
});

router.get('/manage/implementation', async ctx => {
  ctx.implementations = await models.Implementation
    .query()
    .select(
      'implementations.implementation_id',
      'implementations.requested_on',
      'client.name as clientName',
      'service.name as serviceName',
    )
    .groupBy('implementations.implementation_id', 'client.name', 'service.name')
    .joinRelation('client')
    .joinRelation('service')
    .joinRelation('manager')
    .joinRelation('tasks')
    .whereNull('tasks.completed_on');

  return ctx.render('implementation', {
    clients: ctx.clients,
    services: ctx.services,
    implementations: ctx.implementations,
    role: ctx.session.role,
    name: ctx.session.name,
  });
});

router.post('/manage/implementation', async ctx => {
  const { client, service, notes } = ctx.request.body;
  const steps = await models.Step.query().where('service_id', '=', service);
  await transaction(models.Implementation.knex(), async (trx) => {
    const implementation = await models.Implementation
      .query(trx)
      .returning('implementation_id')
      .insert({ service_id: parseInt(service), client_id: parseInt(client), notes: notes });
    const tasks = [];
    for (const step of steps) {
      tasks.push({ step_id: step.step_id, implementation_id: implementation.implementation_id });
    }
    await models.Task
      .query(trx)
      .insert(tasks);
  });
  ctx.implementations = await models.Implementation
    .query()
    .select(
      'implementations.implementation_id',
      'implementations.requested_on',
      'client.name as clientName',
      'service.name as serviceName',
    )
    .groupBy('implementations.implementation_id', 'client.name', 'service.name')
    .joinRelation('client')
    .joinRelation('service')
    .joinRelation('manager')
    .joinRelation('tasks')
    .whereNull('tasks.completed_on');
  return ctx.render('implementation', {
    clients: ctx.clients,
    services: ctx.services,
    implementations: ctx.implementations,
    role: ctx.session.role,
    name: ctx.session.name,
  });
});

router.get('/logout', async (ctx) => {
  ctx.session.authenticated = false;

  delete ctx.session.employeeID;
  delete ctx.session.name;
  delete ctx.session.role;

  return ctx.redirect(ctx.loginURL);
});



app.on('error', (error) => {
  logger.error(`${error.stack}`);
})

app.use(router.routes());

app.listen(8000, () => {
  logger.info("server listening on localhost:8000");
});

