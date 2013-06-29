'use strict';

/**
 * @private
 * @type {object.<number, CodeDefinition>}
 */
var codeMap = {};

/**
 * @private
 * @type {object.<string, CodeDefinition>}
 */
var nameMap = {};

/**
 * @constructor
 * @param {number} code
 * @param {string} name
 * @param {string} description
 */
function CodeDefinition(code, name, description)
{
  /**
   * @type {number}
   */
  this.code = code;

  /**
   * @type {string}
   */
  this.name = name;

  /**
   * @type {string}
   */
  this.description = description;
}

/**
 * @returns {boolean}
 */
CodeDefinition.prototype.isRequest = function()
{
  return this.code >= 1 && this.code <= 31;
};

/**
 * @returns {boolean}
 */
CodeDefinition.prototype.isResponse = function()
{
  return this.code >= 64;
};

/**
 * @returns {boolean}
 */
CodeDefinition.prototype.isSuccess = function()
{
  return (this.code & 224) >> 5 === 2;
};

/**
 * @returns {boolean}
 */
CodeDefinition.prototype.isClientError = function()
{
  return (this.code & 224) >> 5 === 4;
};

/**
 * @returns {boolean}
 */
CodeDefinition.prototype.isServerError = function()
{
  return (this.code & 224) >> 5 === 5;
};

/**
 * @param {number} code
 * @param {string} name
 * @param {string} description
 */
function register(code, name, description)
{
  var codeDefinition = new CodeDefinition(code, name, description);

  codeMap[code] = codeDefinition;
  nameMap[name] = codeDefinition;
}

/**
 * @param {number|string} codeOrName
 * @returns {CodeDefinition}
 * @throws {Error} If there is no code definition registered under
 * the specified message code number or name.
 */
function get(codeOrName)
{
  var map = typeof codeOrName === 'number' ? codeMap : nameMap;
  var definition = map[codeOrName];

  if (!definition)
  {
    throw new Error("Unknown message code: " + codeOrName);
  }

  return definition;
}

register(0, 'empty', 'Empty');
register(1, 'get', 'GET');
register(2, 'post', 'POST');
register(3, 'put', 'PUT');
register(4, 'delete', 'DELETE');
register(65, 'created', '2.01 Created');
register(66, 'deleted', '2.02 Deleted');
register(67, 'valid', '2.03 Valid');
register(68, 'changed', '2.04 Changed');
register(69, 'content', '2.05 Content');
register(128, 'badRequest', '4.00 Bad Request');
register(129, 'unauthorized', '4.01 Unauthorized');
register(130, 'badOption', '4.02 Bad Option');
register(131, 'forbidden', '4.03 Forbidden');
register(132, 'notFound', '4.04 Not Found');
register(133, 'methodNotAllowed', '4.05 Method Not Allowed');
register(134, 'notAcceptable', '4.06 Not Acceptable');
register(136, 'requestEntityIncomplete', '4.08 Request Entity Incomplete');
register(140, 'preconditionFailed', '4.12 Precondition Failed');
register(141, 'requestEntityTooLarge', '4.13 Request Entity Too Large');
register(143, 'unsupportedMediaType', '4.15 Unsupported Media Type');
register(160, 'internalServerError', '5.00 Internal Server Error');
register(161, 'notImplemented', '5.01 Not Implemented');
register(162, 'badGateway', '5.02 Bad Gateway');
register(163, 'serviceUnavailable', '5.03 Service Unavailable');
register(164, 'gatewayTimeout', '5.04 Gateway Timeout');
register(165, 'proxyingNotSupported', '5.05 Proxying Not Supported');

module.exports = {
  register: register,
  get: get
};
