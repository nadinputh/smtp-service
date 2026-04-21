/**
 * Artillery custom processor — helper functions for load tests.
 */

function generateCredentials(userContext, _events, done) {
  const id = `load_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  userContext.vars.email = `${id}@loadtest.local`;
  userContext.vars.password = "LoadT3st!Secure";
  return done();
}

function captureDomain(req, res, userContext, _events, done) {
  try {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const body = JSON.parse(res.body);
      userContext.vars.domainId = body.id;
    }
  } catch {
    // ignore
  }
  return done();
}

module.exports = { generateCredentials, captureDomain };
