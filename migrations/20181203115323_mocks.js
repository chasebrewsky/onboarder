
exports.up = async (knex, Promise) => {
  const [ workerID, managerID, randomID ] = await knex.insert([{
    email: 'george.costanza@email.com',
    name: 'George Costanza',
    password: 'in_the_pool',
  }, {
    email: 'jerry.seinfeld@email.com',
    name: 'Jerry Seinfeld',
    password: 'whats_the_deal',
  }, {
    email: 'elaine.benes@email.com',
    name: 'Elaine Benes',
    password: '',
  }], 'employee_id').into('employees');
  await knex.insert([{ employee_id: workerID }, { employee_id: randomID }]).into('workers');
  await knex.insert([{ employee_id: managerID }]).into('project_managers');
  const [megacorpID, eateryID] = await knex.insert([{
    name: 'MEGACORP',
    email: 'megacorp@email.com',
    address: '731 Arlington Dr. Willingboro, NJ 08046',
    managed_by: managerID,
  }, {
    name: 'Eatery',
    email: 'eatery@email.com',
    address: '15 Iroquois Drive New Berlin, WI 53151',
    managed_by: managerID,
  }], 'client_id').into('clients');
  const [ idsID, firewallID ] = await knex.insert([{
    name: 'IDS Endpoint',
    description: 'Ship a physical IDS solution to a client to attached to their network',
    typical_time: 5,
    typical_time_unit: 'D',
  }, {
    name: 'Firewall Endpoint',
    description: 'Ship a physical managed firewall to a client to attached to their network',
    typical_time: 8,
    typical_time_unit: 'D',
  }], 'service_id').into('services');
  const [orderidsID, orderfirewallID] = await knex.insert([{
    service_id: idsID,
    name: 'Order IDS Hardware',
    description: 'IDS hardware must be ordered to place IDS solution onto',
  }, {
    service_id: firewallID,
    name: 'Order Firewall Hardware',
    description: 'Firewall hardware must be ordered',
  }], 'step_id').into('steps');
  const [dockeridsID, configurefirewallID] = await knex.insert([{
    service_id: idsID,
    name: 'Install Docker',
    blocked_by: orderidsID,
    description: 'Install docker on the machine to place IDS container onto',
  }, {
    service_id: firewallID,
    name: 'Configure Firewall',
    blocked_by: orderfirewallID,
    description: 'Configure firewall based on the clients needs',
  }], 'step_id').into('steps');
  const [configreidsID] = await knex.insert([{
    service_id: idsID,
    name: 'Configure IDS',
    blocked_by: dockeridsID,
    description: 'Configure IDS based on the clients needs',
  }, {
    service_id: firewallID,
    name: 'Ship Firewall',
    blocked_by: configurefirewallID,
    description: 'Ship the firewall to the clients address',
  }], 'step_id').into('steps');
  await knex.insert([{
    service_id: idsID,
    name: 'Ship IDS',
    blocked_by: configreidsID,
    description: 'Ship IDS to the clients address',
  }]).into('steps');
  await knex.insert([{
    worker_id: workerID,
    service_id: idsID
  }, {
    worker_id: workerID,
    service_id: firewallID,
  }, {
    worker_id: randomID,
    service_id: firewallID,
  }]).into('worker_services');
};

exports.down = async (knex, Promise) => {
  await knex('worker_services').delete();
  await knex('steps').delete();
  await knex('services').delete();
  await knex('project_managers').delete();
  await knex('workers').delete();
  await knex('employees').delete();
};
