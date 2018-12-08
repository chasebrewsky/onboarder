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

async function getassigned(ctx) {
  const query = models.Task
    .query()
    .select(
      'tasks.task_id',
      'service.name as serviceName',
      'step.name as stepName',
      'step.blocked_by as parent_step',
      'implementation.implementation_id as implementationID',
      'client.name as clientName'
    )
    .whereNull('completed_on')
    .joinRelation('service')
    .joinRelation('implementation')
    .joinRelation('step')
    .joinRelation('client');

  if (ctx.session.role === 'manager') {
    query.whereIn('tasks.task_id', models.TaskAssignment.query().distinct('task_id'));
  } else {
    query.whereIn('tasks.task_id', models.TaskAssignment.query()
      .select('task_id')
      .where('assigned_to', '=', ctx.session.employeeID)
      .orderBy('assigned_on')
      .first()
    );
  }

  return await query;
}

router.use('/', middlewares.authenticated())
router.get('/', async ctx => {
  const assigned = await getassigned(ctx);

  const completed = await models.Task
    .query()
    .select(
      'tasks.task_id',
      'service.name as serviceName',
      'step.name as stepName',
      'implementation.implementation_id as implementationID',
      'client.name as clientName'
    )
    .whereNotNull('completed_on')
    .joinRelation('implementation')
    .joinRelation('step')
    .joinRelation('service')
    .joinRelation('client');
  
  const unassigned = await models.Task
    .query()
    .select(
      'tasks.task_id',
      'service.name as serviceName',
      'step.name as stepName',
      'step.blocked_by as parent_step',
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
    completed: completed,
  });
});

function taskval(taskID) {
  return models.Task
  .query()
  .select(
    'tasks.task_id',
    'tasks.notes',
    'tasks.completed_on',
    'service.name as serviceName',
    'service.description as serviceDescription',
    'step.name as stepName',
    'step.blocked_by as parent_step',
    'step.description as stepDescription',
    'implementation.implementation_id as implementationID',
    'implementation.notes as implementationNotes',
    'client.name as clientName',
  )
  .where('tasks.task_id', '=', taskID)
  .joinRelation('implementation')
  .joinRelation('step')
  .joinRelation('service')
  .joinRelation('client')
  .first()
  .then(row => row);
}

async function taskdata(task) {
  const assignees = await models.TaskAssignment
    .query()
    .select(
      'task_assignments.assigned_on',
      'assigner.name as assigner_name',
      'assignee.name as assignee_name',
      'assignee.employee_id as assignee_id',
    )
    .where('task_assignments.task_id', '=', task.task_id)
    .orderBy('task_assignments.assigned_on')
    .joinRelation('assignee')
    .joinRelation('assigner');

  const workers = await models.Worker
    .query()
    .select(
      'employee.employee_id as employee_id',
      'employee.name as name',
    )
    .joinRelation('employee');

  let blocker;

  if (task.parent_step) {
    blocker = await models.Task
    .query()
    .select(
      'tasks.task_id',
      'tasks.completed_on',
      'service.name as serviceName',
      'step.name as stepName',
      'client.name as clientName',
    )
    .joinRelation('step')
    .joinRelation('service')
    .joinRelation('client')
    .where('tasks.step_id', '=', task.parent_step)
    .where('tasks.implementation_id', '=', task.implementationID)
    .first()
    .then(row => row);
  }

  const requests = await models.InformationRequests
    .query()
    .select(
      'information_requests.requested_on',
      'information_requests.requested_info',
      'information_requests.completed_info',
      'requester.name as requester',
      'assignee.name as manager',
    )
    .where('information_requests.task_id', '=', task.task_id)
    .joinRelation('requester')
    .joinRelation('assignee');

  if (blocker && blocker.completed_on) blocker = undefined;

  return {
    assignees,
    workers,
    blocker,
    requests,
  }
}

router.get('/task/:id', async ctx => {
  const task = await taskval(ctx.params.id);

  if (!task) return ctx.render('404');

  const data = await taskdata(task);

  return ctx.render('task', {
    name: ctx.session.name,
    role: ctx.session.role,
    task: task,
    blocker: data.blocker,
    assignees: data.assignees,
    workers: data.workers,
    requests: data.requests,
    employeeID: ctx.session.employeeID,
  });
});

async function requestinfo(ctx, task) {
  const { worker, info } = ctx.request.body;
  const manager = await task.getManagerID();
  return transaction(models.InformationRequests.knex(), async (trx) => {
    await models.InformationRequests
      .query(trx)
      .insert({
        task_id: task.task_id,
        requested_by: parseInt(worker),
        assigned_to: manager,
        requested_info: info,
      });
  });
}

async function assigntask(ctx, task) {
  const { worker } = ctx.request.body;
  return transaction(models.TaskAssignment.knex(), async (trx) => {
    await models.TaskAssignment
      .query(trx)
      .insert({
        task_id: task.task_id,
        assigned_by: ctx.session.employeeID,
        assigned_to: parseInt(worker),
      });
  });
}

async function completetask(task) {
  return transaction(models.Task.knex(), async (trx) => {
    await models.Task
      .query(trx)
      .where('task_id', '=', task.task_id)
      .update({ completed_on: new Date() });
  });
}

router.post('/task/:id', async ctx => {
  const task = await taskval(ctx.params.id);

  if (!task) return ctx.render('404');

  const { action } = ctx.request.body;
  if (!action) throw new Error('action missing in task POST');

  switch (action) {
    case 'assign': await assigntask(ctx, task); break;
    case 'request': await requestinfo(ctx, task); break;
    case 'complete':
      await completetask(task)
      return ctx.redirect(ctx.homeURL);
    default: throw new Error(`action ${action} is not valid`);
  }

  const data = await taskdata(task);

  return ctx.render('task', {
    name: ctx.session.name,
    role: ctx.session.role,
    task: task,
    blocker: data.blocker,
    assignees: data.assignees,
    workers: data.workers,
    requests: data.requests,
    employeeID: ctx.session.employeeID,
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

  const requests = await models.InformationRequests
    .query()
    .where('information_requests.assigned_to', '=', ctx.session.employeeID);

  return ctx.render('manage', {
    clients: clients,
    role: ctx.session.role,
    name: ctx.session.name,
    requests: requests,
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

async function getrequests(ctx) {
  return models.InformationRequests
    .query()
    .select(
      'information_requests.request_id',
      'requester.name as requester',
      'information_requests.requested_on',
      'information_requests.task_id',
      'implementation.implementation_id',
      'step.name as step_name',
      'information_requests.requested_info',
    )
    .where('information_requests.assigned_to', '=', ctx.session.employeeID)
    .whereNull('information_requests.completed_on')
    .joinRelation('task')
    .joinRelation('requester')
    .joinRelation('step')
    .joinRelation('implementation');
}

router.get('/manage/requests', async ctx => {
  const requests = await getrequests(ctx);

  return ctx.render('requests', {
    name: ctx.session.name,
    role: ctx.session.role,
    requests: requests,
  });
});

router.post('/manage/requests', async ctx => {
  const { reply, request } = ctx.request.body;

  await transaction(models.InformationRequests.knex(), async (trx) => {
    await models.InformationRequests
      .query(trx)
      .where('request_id', '=', parseInt(request))
      .update({
        completed_on: new Date(),
        completed_info: reply,
      });
  });

  const requests = await getrequests(ctx);
  return ctx.render('requests', {
    name: ctx.session.name,
    role: ctx.session.role,
    requests: requests,
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

