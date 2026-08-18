// Forward to unified feed controller
module.exports = (req, res) => {
  req.query = req.query || {};
  req.query.type = 'sitemap';
  return require('./feed')(req, res);
};
