const Joi = require('joi');

exports.searchQuerySchema = {
  q: Joi.string().trim().required()
}
