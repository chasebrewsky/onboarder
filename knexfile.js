// Update with your config settings.
require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    user: process.env.PGUSER,
  },
};
