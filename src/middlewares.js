module.exports.render404 = (template) => async (ctx, next) => {
  await next();
  if (ctx.status == 404) return ctx.render(template);
};

module.exports.configure = (config) => (ctx, next) => {
  if (config) {
    ctx.loginURL = config.loginURL;
    ctx.homeURL = config.homeURL;
    ctx.logger = config.logger;
  }
  return next();
};

module.exports.authenticated = (redirectURL) => (ctx, next) => {
  return ctx.session.authenticated == true ? next() : ctx.redirect(redirectURL || ctx.loginURL);
}

module.exports.unauthenticated = (redirectURL) => (ctx, next) => {
  return !ctx.session.authenticated == true ? next() : ctx.redirect(redirectURL || ctx.homeURL);
};
