
exports.up = async (knex, Promise) => {
  await knex.schema.createTable('employees', (table) => {
    table.increments('employee_id').primary();
    table.string('email').notNullable();
    table.string('password').notNullable();
    table.string('name').notNullable();
  });
  await knex.schema.createTable('workers', (table) => {
    table.integer('employee_id').references('employees.employee_id').primary();
  });
  await knex.schema.createTable('project_managers', (table) => {
    table.integer('employee_id').references('employees.employee_id').primary();
  });
  await knex.schema.createTable('clients', (table) => {
    table.increments('client_id').primary();
    table.string('name').notNullable();
    table.string('address').notNullable();
    table.string('email').notNullable();
    table.integer('managed_by').references('project_managers.employee_id');
  });
  await knex.schema.createTable('services', (table) => {
    table.increments('service_id').primary();
    table.string('name').notNullable();
    table.text('description').notNullable();
    table.specificType('typical_time_unit', 'char(1)').notNullable();
    table.integer('typical_time').notNullable();
  });
  await knex.schema.createTable('steps', (table) => {
    table.increments('step_id').primary();
    table.integer('service_id').references('services.service_id').notNullable();
    table.integer('blocked_by').references('steps.step_id');
    table.string('name').notNullable();
    table.text('description').notNullable();
  });
  await knex.schema.createTable('worker_services', (table) => {
    table.integer('worker_id').references('workers.employee_id').notNullable();
    table.integer('service_id').references('services.service_id').notNullable();
    table.primary(['worker_id', 'service_id']);
  });
  await knex.schema.createTable('implementations', (table) => {
    table.increments('implementation_id').primary();
    table.integer('service_id').references('services.service_id').notNullable();
    table.integer('client_id').references('clients.client_id').notNullable();
    table.timestamp('requested_on').notNullable().defaultTo(knex.raw('now()'));
    table.text('notes');
  });
  await knex.schema.createTable('tasks', (table) => {
    table.increments('task_id').primary();
    table.integer('step_id').references('steps.step_id').notNullable();
    table.integer('implementation_id').references('implementations.implementation_id').notNullable();
    table.text('notes');
    table.timestamp('completed_on');
  });
  await knex.schema.createTable('task_assignments', (table) => {
    table.increments('assignment_id').primary();
    table.integer('task_id').references('tasks.task_id').notNullable();
    table.integer('assigned_by').references('employees.employee_id').notNullable();
    table.integer('assigned_to').references('workers.employee_id').notNullable();
    table.timestamp('assigned_on').defaultTo(knex.raw('now()'));
  });
  await knex.schema.createTable('information_requests', (table) => {
    table.increments('request_id').primary();
    table.integer('task_id').references('tasks.task_id').notNullable();
    table.integer('requested_by').references('workers.employee_id').notNullable();
    table.integer('assigned_to').references('project_managers.employee_id').notNullable();
    table.timestamp('requested_on').notNullable().defaultTo(knex.raw('now()'));
    table.text('requested_info').notNullable();
    table.timestamp('completed_on');
    table.text('completed_info');
  });
};

exports.down = async (knex, Promise) => {
  await knex.schema.dropTable('information_requests');
  await knex.schema.dropTable('task_assignments');
  await knex.schema.dropTable('tasks');
  await knex.schema.dropTable('implementations');
  await knex.schema.dropTable('worker_services');
  await knex.schema.dropTable('steps');
  await knex.schema.dropTable('services');
  await knex.schema.dropTable('clients');
  await knex.schema.dropTable('project_managers');
  await knex.schema.dropTable('workers');
  await knex.schema.dropTable('employees');
};
