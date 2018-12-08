const { Model } = require('objection');

Model.knex(require('knex')(require('../knexfile')));

class Employee extends Model {
  static get tableName() { return 'employees'; }
  static get idColumn() { return 'employee_id'; }
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'email', 'password'],
      properties: {
        employee_id: {type: 'integer'},
        name: {type: 'string'},
        email: {type: 'string'},
        password: {type: 'string'},
      }
    };
  }
  async role() {
    const [workerID, managerID] = await Promise.all([
      Worker
        .query()
        .select('employee_id')
        .where('employee_id', '=', this.employee_id)
        .first()
        .then(row => row),
      ProjectManager
        .query()
        .select('employee_id')
        .where('employee_id', '=', this.employee_id)
        .first()
        .then(row => row),
    ]);
    if (workerID) return 'worker';
    if (managerID) return 'manager';
  }
}

class Worker extends Model {
  static get tableName() { return 'workers'; }
  static get idColumn() { return 'employee_id'; }
  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        employee_id: {type: 'integer'},
      }
    };
  }
  static get relationMappings() {
    return {
      employee: {
        relation: Model.BelongsToOneRelation,
        modelClass: Employee,
        join: {
          from: 'workers.employee_id',
          to: 'employees.employee_id'
        }
      },
      services: {
        relation: Model.ManyToManyRelation,
        modelClass: Service,
        join: {
          from: 'workers.employee_id',
          through: {
            from: 'worker_services.worker_id',
            to: 'worker_services.service_id',
          },
          to: 'services.service_id',
        },
      },
    };
  }
}

class ProjectManager extends Model {
  static get tableName() { return 'project_managers'; }
  static get idColumn() { return 'project_manager_id'; }
  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        employee_id: {type: 'integer'},
      }
    };
  }
  static get relationMappings() {
    return {
      employee: {
        relation: Model.BelongsToOneRelation,
        modelClass: Employee,
        join: {
          from: 'project_managers.employee_id',
          to: 'employees.employee_id'
        }
      },
    };
  }
}

class Client extends Model {
  static get tableName() { return 'clients'; }
  static get idColumn() { return 'client_id'; }
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'address', 'email'],
      properties: {
        client_id: {type: 'integer'},
        name: {type: 'string'},
        address: {type: 'string'},
        email: {type: 'string'},
        managed_by: {type: ['integer', 'null']}
      }
    };
  }
  static get relationMappings() {
    return {
      manager: {
        relation: Model.BelongsToOneRelation,
        modelClass: ProjectManager,
        join: {
          from: 'clients.managed_by',
          to: 'project_managers.employee_id'
        }
      },
    };
  }
}

class Service extends Model {
  static get tableName() { return 'services'; }
  static get idColumn() { return 'service_id'; }
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'description', 'typical_time_unit'],
      properties: {
        service_id: {type: 'integer'},
        name: {type: 'string'},
        address: {type: 'string'},
        email: {type: 'string'},
        managed_by: {type: ['integer', 'null']}
      }
    };
  }
  static get relationMappings() {
    return {
      manager: {
        relation: Model.BelongsToOneRelation,
        modelClass: ProjectManager,
        join: {
          from: 'services.managed_by',
          to: 'project_managers.employee_id'
        }
      },
      workers: {
        relation: Model.ManyToManyRelation,
        modelClass: Worker,
        join: {
          from: 'services.service_id',
          through: {
            from: 'worker_services.service_id',
            to: 'worker_services.worker_id',
          },
          to: 'workers.employee_id',
        },
      }
    };
  }
}

class Step extends Model {
  static get tableName() { return 'steps'; }
  static get idColumn() { return 'step_id'; }
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['service_id', 'name', 'description'],
      properties: {
        step_id: {type: 'integer'},
        service_id: {type: 'integer'},
        blocked_by: {type: ['integer', 'null']},
        name: {type: 'string'},
        description: {type: 'string'}
      }
    };
  }
  static get relationMappings() {
    return {
      service: {
        relation: Model.BelongsToOneRelation,
        modelClass: Service,
        join: {
          from: 'steps.service_id',
          to: 'services.service_id'
        }
      },
      blocker: {
        relation: Model.BelongsToOneRelation,
        modelClass: Step,
        join: {
          from: 'steps.blocked_by',
          to: 'steps.step_id'
        }
      },
    };
  }
}

class Implementation extends Model {
  static get tableName() { return 'implementations'; }
  static get idColumn() { return 'implementation_id'; }
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['service_id', 'client_id'],
      properties: {
        implementation_id: {type: 'integer'},
        service_id: {type: 'integer'},
        client_id: {type: 'integer'},
        requested_on: {type: 'date'},
        notes: {type: 'string'},
      }
    };
  }

  identifier() { return `${this.serviceName} ${this.implementation_id}: ${this.clientName}` };
  static get relationMappings() {
    return {
      service: {
        relation: Model.BelongsToOneRelation,
        modelClass: Service,
        join: {
          from: 'implementations.service_id',
          to: 'services.service_id'
        }
      },
      client: {
        relation: Model.BelongsToOneRelation,
        modelClass: Client,
        join: {
          from: 'implementations.client_id',
          to: 'clients.client_id'
        }
      },
      tasks: {
        relation: Model.HasManyRelation,
        modelClass: Task,
        join: {
          from: 'implementations.implementation_id',
          to: 'tasks.implementation_id',
        },
      },
      manager: {
        relation: Model.HasOneThroughRelation,
        modelClass: ProjectManager,
        join: {
          from: 'implementations.client_id',
          through: {
            from: 'clients.client_id',
            to: 'clients.managed_by'
          },
          to: 'project_managers.employee_id',
        },
      },
    };
  }
}

class Task extends Model {
  static get tableName() { return 'tasks'; }
  static get idColumn() { return 'task_id'; }

  identifier() { return `${this.serviceName} ${this.implementationID}: ${this.clientName} | ${this.stepName}` }

  getManagerID() {
    return Task
      .query()
      .select('client.managed_by')
      .joinRelation('client')
      .first()
      .then(row => row.managed_by);
  }

  static get relationMappings() {
    return {
      step: {
        relation: Model.BelongsToOneRelation,
        modelClass: Step,
        join: {
          from: 'tasks.step_id',
          to: 'steps.step_id'
        }
      },
      implementation: {
        relation: Model.BelongsToOneRelation,
        modelClass: Implementation,
        join: {
          from: 'tasks.implementation_id',
          to: 'implementations.implementation_id'
        },
      },
      service: {
        relation: Model.HasOneThroughRelation,
        modelClass: Service,
        join: {
          from: 'tasks.step_id',
          through: {
            from: 'steps.step_id',
            to: 'steps.service_id',
          },
          to: 'services.service_id',
        },
      },
      client: {
        relation: Model.HasOneThroughRelation,
        modelClass: Client,
        join: {
          from: 'tasks.implementation_id',
          through: {
            from: 'implementations.implementation_id',
            to: 'implementations.client_id',
          },
          to: 'clients.client_id',
        },
      },
      assignments: {
        relation: Model.HasManyRelation,
        modelClass: TaskAssignment,
        join: {
          from: 'tasks.task_id',
          to: 'task_assignments.task_id',
        },
      },
      assigned_to: {
        relation: Model.ManyToManyRelation,
        modelClass: Worker,
        join: {
          from: 'tasks.task_id',
          through: {
            from: 'task_assignments.task_id',
            to: 'task_assignments.assigned_to',
          },
          to: 'workers.employee_id'
        },
      }
    };
  }
}

class TaskAssignment extends Model {
  static get tableName() { return 'task_assignments'; }
  static get idColumn() { return 'assignment_id'; }
  static get relationMappings() {
    return {
      task: {
        relation: Model.BelongsToOneRelation,
        modelClass: Task,
        join: {
          from: 'task_assignments.task_id',
          to: 'tasks.task_id'
        }
      },
      assigner: {
        relation: Model.BelongsToOneRelation,
        modelClass: Employee,
        join: {
          from: 'task_assignments.assigned_by',
          to: 'employees.employee_id',
        },
      },
      assignee: {
        relation: Model.HasOneRelation,
        modelClass: Employee,
        join: {
          from: 'task_assignments.assigned_to',
          to: 'employees.employee_id',
        },
      },
    };
  }
}

class InformationRequests extends Model {
  static get tableName() { return 'information_requests'; }
  static get idColumn() { return 'request_id'; }
  static get relationMappings() {
    return {
      task: {
        relation: Model.HasOneRelation,
        modelClass: Task,
        join: {
          from: 'information_requests.task_id',
          to: 'tasks.task_id'
        }
      },
      requester: {
        relation: Model.HasOneRelation,
        modelClass: Employee,
        join: {
          from: 'information_requests.requested_by',
          to: 'employees.employee_id',
        },
      },
      step: {
        relation: Model.HasOneThroughRelation,
        modelClass: Step,
        join: {
          from: 'information_requests.task_id',
          through: {
            from: 'tasks.task_id',
            to: 'tasks.step_id',
          },
          to: 'steps.step_id',
        },
      },
      implementation: {
        relation: Model.HasOneThroughRelation,
        modelClass: Implementation,
        join: {
          from: 'information_requests.task_id',
          through: {
            from: 'tasks.task_id',
            to: 'tasks.implementation_id',
          },
          to: 'implementations.implementation_id',
        },
      },
      assignee: {
        relation: Model.HasOneRelation,
        modelClass: Employee,
        join: {
          from: 'information_requests.assigned_to',
          to: 'employees.employee_id',
        },
      },
    };
  }
}

module.exports = {
  Employee,
  Worker,
  ProjectManager,
  Client,
  Service,
  Step,
  Implementation,
  Task,
  TaskAssignment,
  InformationRequests,
};
