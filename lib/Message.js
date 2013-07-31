'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var buffers = require('h5.buffers');
var helpers = require('./helpers');
var codeRegistry = require('./codeRegistry');
var contentFormatRegistry = require('./contentFormatRegistry');
var Option = require('./Option');
var Options = require('./Options');
var BlockOption = require('./BlockOption');
var EndpointAddress = require('./EndpointAddress');

/**
 * @private
 * @const
 * @type {string}
 */
var PRETTY_STR_START_LINE = new Array(79).join('=');

/**
 * @private
 * @const
 * @type {string}
 */
var PRETTY_STR_SEPARATOR_LINE = new Array(79).join('-');

/**
 * @private
 * @const
 * @type {string}
 */
var PATH_SEPARATOR = '/';

/**
 * @private
 * @const
 * @type {string}
 */
var QUERY_SEPARATOR = '&';

/**
 * @constructor
 * @extends {EventEmitter}
 */
function Message()
{
  EventEmitter.call(this);

  /**
   * @private
   * @type {Message.Type}
   */
  this.type = Message.Type.CON;

  /**
   * @private
   * @type {CodeDefinition}
   */
  this.codeDefinition = codeRegistry.get(Message.Code.EMPTY);

  /**
   * @private
   * @type {number}
   */
  this.id = 0;

  /**
   * @private
   * @type {Buffer|null}
   */
  this.token = null;

  /**
   * @private
   * @type {Options}
   */
  this.options = new Options();

  /**
   * @private
   * @type {Buffer|null}
   */
  this.payload = null;

  /**
   * @private
   * @type {EndpointAddress}
   */
  this.remoteEndpoint = new EndpointAddress('127.0.0.1');

  /**
   * @private
   * @type {number}
   */
  this.timestamp = -1;
}

util.inherits(Message, EventEmitter);

/**
 * @enum {number}
 */
Message.Type = {
  CON: 0,
  NON: 1,
  ACK: 2,
  RST: 3
};

/**
 * @param {Message.Type} type
 * @returns {string}
 * @throws {Error} If the specified type is unknown.
 */
Message.getTypeString = function(type)
{
  /*jshint -W015*/

  switch (type)
  {
    case Message.Type.CON:
      return 'CON';

    case Message.Type.NON:
      return 'NON';

    case Message.Type.ACK:
      return 'ACK';

    case Message.Type.RST:
      return 'RST';

    default:
      throw new Error("Unknown message type: " + type);
  }
};

/**
 * @enum {number}
 */
Message.Code = {
  EMPTY: 0,
  GET: 1,
  POST: 2,
  PUT: 3,
  DELETE: 4,
  CREATED: 65,
  DELETED: 66,
  VALID: 67,
  CHANGED: 68,
  CONTENT: 69,
  BAD_REQUEST: 128,
  UNAUTHORIZED: 129,
  BAD_OPTION: 130,
  FORBIDDEN: 131,
  NOT_FOUND: 132,
  METHOD_NOT_ALLOWED: 133,
  NOT_ACCEPTABLE: 134,
  REQUEST_ENTITY_INCOMPLETE: 136,
  PRECONDITION_FAILED: 140,
  REQUEST_ENTITY_TOO_LARGE: 141,
  UNSUPPORTED_CONTENT_FORMAT: 143,
  INTERNAL_SERVER_ERROR: 160,
  NOT_IMPLEMENTED: 161,
  BAD_GATEWAY: 162,
  SERVICE_UNAVAILABLE: 163,
  GATEWAY_TIMEOUT: 164,
  PROXYING_NOT_SUPPORTED: 165
};

/**
 * @enum {number}
 */
Message.Option = {
  IF_MATCH: 1,
  URI_HOST: 3,
  ETAG: 4,
  IF_NONE_MATCH: 5,
  OBSERVE: 6,
  URI_PORT: 7,
  LOCATION_PATH: 8,
  URI_PATH: 11,
  CONTENT_FORMAT: 12,
  MAX_AGE: 14,
  URI_QUERY: 15,
  ACCEPT: 16,
  LOCATION_QUERY: 20,
  BLOCK2: 23,
  BLOCK1: 27,
  SIZE2: 28,
  PROXY_URI: 35,
  PROXY_SCHEME: 39,
  SIZE1: 60
};

/**
 * @param {object} obj
 * @param {Message.Type} [obj.type]
 * @param {Message.Code} [obj.code]
 * @param {number} [obj.id]
 * @param {Buffer} [obj.token]
 * @param {Buffer} [obj.payload]
 * @param {object} [obj.block1]
 * @param {object} [obj.block2]
 * @param {string} [obj.uri]
 * @param {string} [obj.uriHost]
 * @param {string} [obj.uriPort]
 * @param {string} [obj.uriPath]
 * @param {string} [obj.uriQuery]
 * @param {string} [obj.locationPath]
 * @param {string} [obj.locationQuery]
 * @param {Buffer|string} [obj.ifMatch]
 * @param {boolean} [obj.ifNoneMatch]
 * @param {Buffer|string} [obj.eTag]
 * @param {number|string} [obj.contentFormat]
 * @param {number|string} [obj.accept]
 * @param {number} [obj.maxAge]
 * @param {string} [obj.proxyUri]
 * @param {string} [obj.proxyScheme]
 * @param {object.<string, function>} [obj.listeners]
 * @returns {Message}
 */
Message.fromObject = function(obj)
{
  var message = new Message();

  Object.keys(obj).forEach(function callSetter(propertyName)
  {
    var propertyValue = obj[propertyName];

    if (propertyName === 'listeners')
    {
      Object.keys(propertyValue).forEach(function addListener(eventName)
      {
        message.addListener(eventName, propertyValue[eventName]);
      });
    }
    else if (typeof propertyValue !== 'undefined')
    {
      var setter = 'set'
        + propertyName.charAt(0).toUpperCase()
        + propertyName.substr(1);

      if (typeof message[setter] === 'function')
      {
        message[setter](propertyValue);
      }
    }
  });

  return message;
};

/**
 * @param {Buffer} buffer
 * @returns {Message}
 * @throws {Error} If the specified buffer is not a valid binary representation
 * of a CoAP message.
 */
Message.fromBuffer = function(buffer)
{
  /*jshint bitwise:false*/

  var version = buffer[0] >> 6;

  if (version !== 1)
  {
    throw new Error("Invalid CoAP version. Expected 1, got: " + version);
  }

  var bufferReader = new buffers.BufferReader(buffer);
  var firstByte = bufferReader.shiftByte();
  var message = new Message();

  message.setTimestamp();
  message.setType((firstByte & 48) >> 4);
  message.setCode(bufferReader.shiftByte());
  message.setId(bufferReader.shiftUInt16());

  var tokenLength = firstByte & 15;

  if (tokenLength > 0)
  {
    message.setToken(bufferReader.shiftBuffer(tokenLength));
  }

  if (bufferReader.length === 0)
  {
    return message;
  }

  Options.unserialize(bufferReader, message);

  if (bufferReader.length > 0)
  {
    message.setPayload(bufferReader.shiftBuffer(bufferReader.length));
  }

  return message;
};

/**
 * @returns {Buffer}
 */
Message.prototype.toBuffer = function()
{
  /*jshint bitwise:false*/

  var bufferBuilder = new buffers.BufferBuilder();
  var tokenLength = this.getTokenLength();

  bufferBuilder.pushUInt32(
    1073741824
    | (this.type << 28)
    | (tokenLength << 24)
    | (this.codeDefinition.code << 16)
    | this.id
  );

  if (tokenLength > 0)
  {
    bufferBuilder.pushBuffer(this.token);
  }

  if (this.options.hasAnyOptions())
  {
    this.options.serialize(bufferBuilder);
  }

  if (this.payload !== null)
  {
    bufferBuilder.pushByte(0xFF);
    bufferBuilder.pushBuffer(this.payload);
  }

  return bufferBuilder.toBuffer();
};

/**
 * @returns {string}
 */
Message.prototype.toString = function()
{
  if (this.isRequest())
  {
    return util.format(
      "%s %s (T=%s ID=%d TK=%s)",
      this.codeDefinition.description,
      this.getUri(),
      this.getTypeString(),
      this.id,
      helpers.convertToHexString(this.getToken())
    );
  }
  else
  {
    return util.format(
      "%s (%s T=%s ID=%d TK=%s)",
      this.codeDefinition.description,
      this.remoteEndpoint,
      this.getTypeString(),
      this.id,
      helpers.convertToHexString(this.getToken())
    );
  }
};

Message.prototype.toPrettyString = function()
{
  /*jshint maxstatements:39*/

  var lines = [PRETTY_STR_START_LINE];

  var headerNames = 'Version | Type | Token Length | ';
  var headerBits = '0 1     | ';
  var headerValues = '1       | ';

  headerBits += helpers.convertToBitString(this.getType(), 2) + '  | ';
  headerValues += this.getTypeString() + '  | ';

  var tkl = this.getTokenLength();
  var tklBits = helpers.convertToBitString(tkl, 4) + '     ';
  var tklValue =
    helpers.rpad(tkl + ' byte' + (tkl === 1 ? '' : 's'), ' ', tklBits.length);

  headerBits += tklBits + ' | ';
  headerValues += tklValue + ' | ';

  var codeDef = this.getCodeDefinition();
  var codeBits = helpers.convertToBitString(codeDef.code, 8);
  var codeLength = Math.max(codeDef.description.length, codeBits.length);

  headerNames += helpers.rpad('Code', ' ', codeLength) + ' | ';
  headerBits += helpers.rpad(codeBits, ' ', codeLength) + ' | ';
  headerValues += helpers.rpad(codeDef.description, ' ', codeLength) + ' | ';

  var id = this.getId();

  headerNames += 'Message ID';
  headerBits += '0x' + helpers.lpad(id.toString(16), '0', 4);
  headerValues += id;

  lines.push(headerNames, headerBits, headerValues, PRETTY_STR_SEPARATOR_LINE);

  if (tkl > 0)
  {
    var token = helpers.convertToHexString(this.getToken(), ' ');
    var tokenLength = Math.max(token.length, 5);

    lines.push(
      helpers.rpad('Token', ' ', tokenLength) + ' | Remote Endpoint',
      helpers.rpad(token, ' ', tokenLength) + ' | ' + this.getRemoteEndpoint()
    );
  }
  else
  {
    lines.push('Remote Endpoint: ' + this.getRemoteEndpoint());
  }

  var options = this.getAllOptions();
  var optionCount = options.length;

  if (optionCount > 0)
  {
    lines.push(PRETTY_STR_SEPARATOR_LINE);

    var optionNameMaxLength = 0;

    options.forEach(function(option)
    {
      var optionNameLength = option.getName().length;

      if (optionNameLength > optionNameMaxLength)
      {
        optionNameMaxLength = optionNameLength;
      }
    });

    options.forEach(function(option)
    {
      lines.push(
        helpers.rpad(option.getName(), ' ', optionNameMaxLength)
          + ': ' + option.toString(false)
      );
    });
  }

  var payload = this.getPayload();

  if (payload.length > 0)
  {
    lines.push(
      PRETTY_STR_SEPARATOR_LINE,
      'Payload (' + payload.length + ' byte'
        + (payload.length === 1 ? '' : 's') + ')',
      contentFormatRegistry.prettyPrint(this.getContentFormat(), payload)
    );
  }

  lines.push(PRETTY_STR_START_LINE);

  return lines.join('\n');
};

/**
 * @returns {{
 *   type: Message.Type,
 *   code: Message.Code,
 *   id: number,
 *   token: Array.<number>,
 *   options: Array.<object>,
 *   payload: Array.<number>,
 *   remoteEndpoint: {address: string, port: number}
 * }}
 */
Message.prototype.toJSON = function()
{
  return {
    type: this.type,
    code: this.codeDefinition.code,
    id: this.id,
    token: this.getToken().toJSON(),
    options: this.options.toJSON(),
    payload: this.getPayload().toJSON(),
    remoteEndpoint: this.remoteEndpoint.toJSON()
  };
};

/**
 * @returns {String}
 */
Message.prototype.getTypeString = function()
{
  return Message.getTypeString(this.getType());
};

/**
 * @returns {Message.Type}
 */
Message.prototype.getType = function()
{
  return this.type;
};

/**
 * @param {Message.Type|string} type
 * @throws {Error} If the specified type is invalid.
 */
Message.prototype.setType = function(type)
{
  /*jshint -W015*/

  if (typeof type === 'string')
  {
    type = type.toUpperCase();
  }

  //noinspection FallthroughInSwitchStatementJS
  switch (type)
  {
    case 'CON':
    case Message.Type.CON:
      this.type = Message.Type.CON;
      break;

    case 'NON':
    case Message.Type.NON:
      this.type = Message.Type.NON;
      break;

    case 'ACK':
    case Message.Type.ACK:
      this.type = Message.Type.ACK;
      break;

    case 'RST':
    case Message.Type.RST:
      this.type = Message.Type.RST;
      break;

    default:
      throw new Error("Invalid message type: " + type);
  }
};

/**
 * @returns {boolean}
 */
Message.prototype.isConfirmable = function()
{
  return this.type === Message.Type.CON;
};

/**
 * @returns {boolean}
 */
Message.prototype.isNonConfirmable = function()
{
  return this.type === Message.Type.NON;
};

/**
 * @returns {boolean}
 */
Message.prototype.isAcknowledgement = function()
{
  return this.type === Message.Type.ACK;
};

/**
 * @returns {boolean}
 */
Message.prototype.isReset = function()
{
  return this.type === Message.Type.RST;
};

/**
 * @returns {boolean}
 */
Message.prototype.isEmptyAcknowledgement = function()
{
  return this.codeDefinition.code === Message.Code.EMPTY
    && this.type === Message.Type.ACK;
};

/**
 * @returns {boolean}
 */
Message.prototype.isReply = function()
{
  return this.type === Message.Type.ACK || this.type === Message.Type.RST;
};

/**
 * @returns {Message.Code}
 */
Message.prototype.getCode = function()
{
  return this.codeDefinition.code;
};

/**
 * @param {Message.Code|string} code
 * @throws {Error} If the specified code is invalid.
 */
Message.prototype.setCode = function(code)
{
  if (typeof code === 'string')
  {
    code = code.toLowerCase();
  }

  this.codeDefinition = codeRegistry.get(code);
};

/**
 * @returns {CodeDefinition}
 */
Message.prototype.getCodeDefinition = function()
{
  return this.codeDefinition;
};

/**
 * @returns {boolean}
 */
Message.prototype.isEmpty = function()
{
  return this.getCode() === Message.Code.EMPTY;
};

/**
 * @returns {boolean}
 */
Message.prototype.isRequest = function()
{
  return this.codeDefinition.isRequest();
};

/**
 * @returns {boolean}
 */
Message.prototype.isResponse = function()
{
  return this.codeDefinition.isResponse();
};

/**
 * @returns {boolean}
 */
Message.prototype.isSuccess = function()
{
  return this.codeDefinition.isSuccess();
};

/**
 * @returns {boolean}
 */
Message.prototype.isClientError = function()
{
  return this.codeDefinition.isClientError();
};

/**
 * @returns {boolean}
 */
Message.prototype.isServerError = function()
{
  return this.codeDefinition.isServerError();
};

/**
 * @returns {number}
 */
Message.prototype.getId = function()
{
  return this.id;
};

/**
 * @param {number} id
 * @throws {Error} If the specified ID is not an unsigned 16-bit integer.
 */
Message.prototype.setId = function(id)
{
  if (id < 0 || id > 0xFFFF)
  {
    throw new Error("Message ID must be an unsigned 16-bit integer: " + id);
  }

  this.id = id;
};

/**
 * @returns {number}
 */
Message.prototype.getTokenLength = function()
{
  return this.token === null ? 0 : this.token.length;
};

/**
 * @returns {Buffer}
 */
Message.prototype.getToken = function()
{
  return this.token === null ? new Buffer(0) : this.token;
};

/**
 * @returns {string}
 */
Message.prototype.getTokenString = function()
{
  return helpers.convertToHexString(this.token);
};

/**
 * @param {Buffer|string|Array.<number>|null} token
 * @throws {Error} If the specified token's length is more than 8 bytes.
 */
Message.prototype.setToken = function(token)
{
  if (token === null || token.length === 0)
  {
    token = null;
  }
  else
  {
    if (!Buffer.isBuffer(token))
    {
      token = new Buffer(token);
    }

    if (token.length === 0)
    {
      token = null;
    }
    else if (token.length > 8)
    {
      throw new Error(
        "Token is too long. Expected at most 8 bytes, got: " + token.length
      );
    }
  }

  this.token = token;
};

/**
 * @returns {EndpointAddress}
 */
Message.prototype.getRemoteEndpoint = function()
{
  return this.remoteEndpoint;
};

/**
 * @param {EndpointAddress|string} address
 * @param {number} [port]
 */
Message.prototype.setRemoteEndpoint = function(address, port)
{
  this.remoteEndpoint = typeof address === 'string'
    ? new EndpointAddress(address, port)
    : address;
};

/**
 * @returns {number}
 */
Message.prototype.getTimestamp = function()
{
  return this.timestamp;
};

/**
 * @param {number} [timestamp]
 */
Message.prototype.setTimestamp = function(timestamp)
{
  this.timestamp = timestamp || Date.now();
};

/**
 * @returns {string}
 */
Message.prototype.getKey = function()
{
  return this.getTransactionKey() + '|' + this.getTypeString();
};

/**
 * @returns {string}
 */
Message.prototype.getExchangeKey = function()
{
  return this.getRemoteEndpoint() + '|' + this.getTokenString();
};

/**
 * @returns {string}
 */
Message.prototype.getTransactionKey = function()
{
  return this.getRemoteEndpoint() + '#' + this.getId();
};

/**
 * @returns {boolean}
 */
Message.prototype.hasAnyOptions = function()
{
  return this.options.hasAnyOptions();
};

/**
 * @returns {Array.<Option>}
 */
Message.prototype.getAllOptions = function()
{
  return this.options.getAllOptions();
};

/**
 * @returns {Array.<Option>}
 */
Message.prototype.getAllOptions = function()
{
  return this.options.getAllOptions();
};

/**
 * @param {Array.<Option>} optionList
 */
Message.prototype.setAllOptions = function(optionList)
{
  this.options = new Options(optionList);
};

/**
 * @param {number} optionNumber
 * @returns {boolean}
 */
Message.prototype.hasOption = function(optionNumber)
{
  return this.options.hasOption(optionNumber);
};

/**
 * @param {number} optionNumber
 * @returns {Array.<Option>}
 */
Message.prototype.getOptions = function(optionNumber)
{
  return this.options.getOptions(optionNumber);
};

/**
 * @param {number} optionNumber
 * @returns {Option|null}
 */
Message.prototype.getFirstOption = function(optionNumber)
{
  return this.options.getFirstOption(optionNumber);
};

/**
 * @param {Option} option
 */
Message.prototype.setOption = function(option)
{
  this.options.setOption(option);
};

/**
 * @param {Option} option
 */
Message.prototype.addOption = function(option)
{
  this.options.addOption(option);
};

Message.prototype.removeAllOptions = function()
{
  this.options.removeAllOptions();
};

/**
 * @param {number} optionNumber
 */
Message.prototype.removeOptions = function(optionNumber)
{
  this.options.removeOptions(optionNumber);
};

/**
 * @returns {boolean}
 */
Message.prototype.hasPayload = function()
{
  return this.payload !== null;
};

/**
 * @returns {Buffer}
 */
Message.prototype.getPayload = function()
{
  return this.payload === null ? new Buffer(0) : this.payload;
};

/**
 * @param {Buffer|string} payload
 */
Message.prototype.setPayload = function(payload)
{
  if (payload.length === 0)
  {
    this.payload = null;
  }
  else if (Buffer.isBuffer(payload))
  {
    this.payload = payload;
  }
  else
  {
    this.payload = new Buffer(String(payload));
  }
};

/**
 * @returns {number}
 */
Message.prototype.getPayloadLength = function()
{
  return this.payload === null ? 0 : this.payload.length;
};

/**
 * @returns {BlockOption|null}
 */
Message.prototype.getBlock1 = function()
{
  return this.getBlockOption(Message.Option.BLOCK1);
};

/**
 * @param {number|object} numberOrOptions
 * @param {boolean} [more]
 * @param {number} [sizeOrSzx]
 */
Message.prototype.setBlock1 = function(numberOrOptions, more, sizeOrSzx)
{
  this.setBlockOption(Message.Option.BLOCK1, numberOrOptions, more, sizeOrSzx);
};

/**
 * @returns {BlockOption|null}
 */
Message.prototype.getBlock2 = function()
{
  return this.getBlockOption(Message.Option.BLOCK2);
};

/**
 * @param {number|object} numberOrOptions
 * @param {boolean} [more]
 * @param {number} [sizeOrSzx]
 */
Message.prototype.setBlock2 = function(numberOrOptions, more, sizeOrSzx)
{
  this.setBlockOption(Message.Option.BLOCK2, numberOrOptions, more, sizeOrSzx);
};

/**
 * @returns {number}
 */
Message.prototype.getSize1 = function()
{
  var option = this.getFirstOption(Message.Option.SIZE1);

  if (option === null)
  {
    return -1;
  }
  else
  {
    return option.getNumericValue();
  }
};

/**
 * @param {number} value
 */
Message.prototype.setSize1 = function(value)
{
  this.setOption(
    new Option(Message.Option.SIZE1, helpers.encodeNumericValue(value))
  );
};

/**
 * @returns {number}
 */
Message.prototype.getSize2 = function()
{
  var option = this.getFirstOption(Message.Option.SIZE2);

  if (option === null)
  {
    return -1;
  }
  else
  {
    return option.getNumericValue();
  }
};

/**
 * @param {number} value
 */
Message.prototype.setSize2 = function(value)
{
  this.setOption(
    new Option(Message.Option.SIZE2, helpers.encodeNumericValue(value))
  );
};

/**
 * @returns {number}
 */
Message.prototype.getObserve = function()
{
  var option = this.getFirstOption(Message.Option.OBSERVE);

  if (option === null)
  {
    return -1;
  }
  else
  {
    return option.getNumericValue();
  }
};

/**
 * @param {boolean|number} value
 */
Message.prototype.setObserve = function(value)
{
  if (value === false)
  {
    this.removeOptions(Message.Option.OBSERVE);

    return;
  }

  if (value === true || value === 0)
  {
    value = null;
  }
  else
  {
    value = helpers.encodeNumericValue(value);
  }

  this.setOption(new Option(Message.Option.OBSERVE, value));
};

/**
 * @returns {boolean}
 */
Message.prototype.getIfNoneMatch = function()
{
  return this.hasOption(Message.Option.IF_NONE_MATCH);
};

/**
 * @param {boolean} value
 */
Message.prototype.setIfNoneMatch = function(value)
{
  this.removeOptions(Message.Option.IF_NONE_MATCH);

  if (value)
  {
    this.addOption(new Option(Message.Option.IF_NONE_MATCH, null));
  }
};

/**
 * @return {Array.<Buffer>}
 */
Message.prototype.getIfMatch = function()
{
  return this.getOptions(Message.Option.IF_MATCH)
    .map(function getIfMatchData(option) { return option.getData(); });
};

/**
 * @param {Buffer|string|Array.<number>} eTag
 */
Message.prototype.setIfMatch = function(eTag)
{
  this.removeOptions(Message.Option.IF_MATCH);
  this.addIfMatch(eTag);
};

/**
 * @param {Buffer|string|Array.<number>} eTag
 */
Message.prototype.addIfMatch = function(eTag)
{
  this.addOption(
    new Option(
      Message.Option.IF_MATCH, Buffer.isBuffer(eTag) ? eTag : new Buffer(eTag)
    )
  );
};

/**
 * @returns {Array.<Buffer>}
 */
Message.prototype.getETag = function()
{
  return this.getOptions(Message.Option.ETAG).map(function getETagData(option)
  {
    return option.getData();
  });
};

/**
 * @param {Buffer|string|Array.<number>} eTag
 */
Message.prototype.setETag = function(eTag)
{
  this.removeOptions(Message.Option.ETAG);
  this.addETag(eTag);
};

/**
 * @param {Buffer|string|Array.<number>} eTag
 */
Message.prototype.addETag = function(eTag)
{
  this.addOption(
    new Option(
      Message.Option.ETAG, Buffer.isBuffer(eTag) ? eTag : new Buffer(eTag)
    )
  );
};

/**
 * @returns {string}
 */
Message.prototype.getUri = function()
{
  var uri = 'coap://';
  uri += this.remoteEndpoint;
  uri += this.getUriPath();

  var uriQuery = this.getUriQuery();

  if (uriQuery.length > 0)
  {
    uri += '?' + uriQuery;
  }

  return uri;
};

/**
 * @param {string} uri
 */
Message.prototype.setUri = function(uri)
{
  var uriParts = url.parse(uri);

  if (uriParts.hostname !== null)
  {
    this.setRemoteEndpoint(uriParts.hostname, uriParts.port);
  }

  if (uriParts.pathname !== null)
  {
    this.setUriPath(uriParts.pathname);
  }

  if (uriParts.query !== null)
  {
    this.setUriQuery(uriParts.query);
  }
};

/**
 * @returns {string}
 */
Message.prototype.getUriHost = function()
{
  var option = this.getFirstOption(Message.Option.URI_HOST);

  return option === null ? '' : option.getData().getStringValue();
};

/**
 * @param {string} uriHost
 */
Message.prototype.setUriHost = function(uriHost)
{
  this.setOption(new Option(Message.Option.URI_HOST, new Buffer(uriHost)));
};

/**
 * @returns {number}
 */
Message.prototype.getUriPort = function()
{
  var option = this.getFirstOption(Message.Option.URI_PORT);

  return option === null ? -1 : option.getNumericValue();
};

/**
 * @param {number} uriPort
 * @throws {Error} If the specified port is not a number between 1 and 65535.
 */
Message.prototype.setUriPort = function(uriPort)
{
  if (uriPort < 1 || uriPort > 65535)
  {
    throw new Error("Uri-Port must be a number between 1 and 65535.");
  }

  this.setOption(
    new Option(Message.Option.URI_PORT, helpers.encodeNumericValue(uriPort))
  );
};

/**
 * @returns {string}
 */
Message.prototype.getUriPath = function()
{
  return '/'
    + this.getStringSeparatedOption(Message.Option.URI_PATH, PATH_SEPARATOR);
};

/**
 * @param {string} uriPath
 */
Message.prototype.setUriPath = function(uriPath)
{
  this.removeOptions(Message.Option.URI_PATH);
  this.addUriPath(uriPath);
};

/**
 * @param {string} uriPath
 */
Message.prototype.addUriPath = function(uriPath)
{
  this.addStringSeparatedOption(
    Message.Option.URI_PATH, PATH_SEPARATOR, uriPath
  );
};

/**
 * @returns {string}
 */
Message.prototype.getUriQuery = function()
{
  return this.getStringSeparatedOption(
    Message.Option.URI_QUERY, QUERY_SEPARATOR
  );
};

/**
 * @param {string} uriQuery
 */
Message.prototype.setUriQuery = function(uriQuery)
{
  this.removeOptions(Message.Option.URI_QUERY);
  this.addUriQuery(uriQuery);
};

/**
 * @param {string} uriQuery
 */
Message.prototype.addUriQuery = function(uriQuery)
{
  this.addStringSeparatedOption(
    Message.Option.URI_QUERY, QUERY_SEPARATOR, uriQuery
  );
};

/**
 * @returns {string}
 */
Message.prototype.getLocationPath = function()
{
  return '/' +
    this.getStringSeparatedOption(Message.Option.LOCATION_PATH, PATH_SEPARATOR);
};

/**
 * @param {string} locationPath
 */
Message.prototype.setLocationPath = function(locationPath)
{
  this.removeOptions(Message.Option.LOCATION_PATH);
  this.addLocationPath(locationPath);
};

/**
 * @param {string} locationPath
 */
Message.prototype.addLocationPath = function(locationPath)
{
  this.addStringSeparatedOption(
    Message.Option.LOCATION_PATH, PATH_SEPARATOR, locationPath
  );
};

/**
 * @returns {string}
 */
Message.prototype.getLocationQuery = function()
{
  return this.getStringSeparatedOption(
    Message.Option.LOCATION_QUERY, QUERY_SEPARATOR
  );
};

/**
 * @param {string} locationQuery
 */
Message.prototype.setLocationQuery = function(locationQuery)
{
  this.removeOptions(Message.Option.LOCATION_QUERY);
  this.addLocationPath(locationQuery);
};

/**
 * @param {string} uriQuery
 */
Message.prototype.addLocationQuery = function(locationQuery)
{
  this.addStringSeparatedOption(
    Message.Option.LOCATION_QUERY, QUERY_SEPARATOR, locationQuery
  );
};

/**
 * @returns {number}
 */
Message.prototype.getContentFormat = function()
{
  var option = this.getFirstOption(Message.Option.CONTENT_FORMAT);

  return option === null ? -1 : option.getNumericValue();
};

/**
 * @param {number|string} idOrMediaType
 * @throws {Error} If there is no content-format definition registered under
 * the specified identifier or media type.
 */
Message.prototype.setContentFormat = function(idOrMediaType)
{
  var contentFormatDefinition = contentFormatRegistry.get(idOrMediaType);

  this.setOption(
    new Option(
      Message.Option.CONTENT_FORMAT,
      helpers.encodeNumericValue(contentFormatDefinition.id)
    )
  );
};

/**
 * @returns {number}
 */
Message.prototype.getAccept = function()
{
  var option = this.getFirstOption(Message.Option.ACCEPT);

  return option === null ? -1 : option.getNumericValue();
};

/**
 * @param {number|string} idOrMediaType
 * @throws {Error} If there is no content-format definition registered under
 * the specified identifier or media type.
 */
Message.prototype.setAccept = function(idOrMediaType)
{
  var contentFormatDefinition = contentFormatRegistry.get(idOrMediaType);

  this.setOption(
    new Option(
      Message.Option.ACCEPT,
      helpers.encodeNumericValue(contentFormatDefinition.id)
    )
  );
};

/**
 * @returns {number}
 */
Message.prototype.getMaxAge = function()
{
  var option = this.getFirstOption(Message.Option.MAX_AGE);

  return option === null ? -1 : option.getNumericValue();
};

/**
 * @param {number} maxAge
 */
Message.prototype.setMaxAge = function(maxAge)
{
  if (maxAge < 0 || maxAge > 0xFFFFFFFF)
  {
    throw new Error("Max-Age must be a number between 0 and 0xFFFFFFFF.");
  }

  this.removeOptions(Message.Option.MAX_AGE);
  this.addOption(
    new Option(Message.Option.MAX_AGE, helpers.encodeNumericValue(maxAge))
  );
};

/**
 * @returns {string}
 */
Message.prototype.getProxyUri = function()
{
  var option = this.getFirstOption(Message.Option.PROXY_URI);

  return option === null ? '' : option.getStringValue();
};

/**
 * @param {string} proxyUri
 */
Message.prototype.setProxyUri = function(proxyUri)
{
  this.setOption(new Option(Message.Option.PROXY_URI, new Buffer(proxyUri)));
};

/**
 * @returns {string}
 */
Message.prototype.getProxyScheme = function()
{
  var option = this.getFirstOption(Message.Option.PROXY_SCHEME);

  return option === null ? '' : option.getStringValue();
};

/**
 * @param {string} proxyScheme
 */
Message.prototype.setProxyScheme = function(proxyScheme)
{
  this.setOption(
    new Option(Message.Option.PROXY_SCHEME, new Buffer(proxyScheme))
  );
};

/**
 * @param {Message.Type} type
 * @param {Message.Code} code
 * @returns {Message}
 */
Message.prototype.createReply = function(type, code)
{
  var reply = new Message();

  if (typeof code !== 'undefined')
  {
    reply.setCode(code);
  }

  reply.setType(type);
  reply.setId(this.getId());
  reply.setRemoteEndpoint(this.getRemoteEndpoint());

  return reply;
};

/**
 * @private
 * @param {Message.Option} optionNumber
 * @returns {object|null}
 */
Message.prototype.getBlockOption = function(optionNumber)
{
  var blockOption = this.getFirstOption(optionNumber);

  if (blockOption === null)
  {
    return null;
  }

  return BlockOption.decode(blockOption.getData(), optionNumber);
};

/**
 * @private
 * @param {Message.Option} optionNumber
 * @param {number|object} numberOrOptions
 * @param {boolean} more
 * @param {number} sizeOrSzx
 */
Message.prototype.setBlockOption =
  function(optionNumber, numberOrOptions, more, sizeOrSzx)
{
  if (typeof numberOrOptions === 'object')
  {
    more = numberOrOptions.m;
    sizeOrSzx = typeof numberOrOptions.szx === 'number'
      ? numberOrOptions.szx
      : numberOrOptions.size;
    numberOrOptions = numberOrOptions.num;
  }

  var num = typeof numberOrOptions === 'number' ? numberOrOptions : 0;
  var m = !!more;
  var szx = sizeOrSzx < 16 ? sizeOrSzx : helpers.encodeBlockSize(sizeOrSzx);

  this.setOption(
    new Option(optionNumber, BlockOption.encode(num, m, szx))
  );
};

/**
 * @private
 * @param {number} optionNumber
 * @param {string} separator
 * @returns {string}
 */
Message.prototype.getStringSeparatedOption = function(optionNumber, separator)
{
  return this.getOptions(optionNumber)
    .map(function getStringValue(option) { return option.getStringValue(); })
    .join(separator);
};

/**
 * @private
 * @param {number} optionNumber
 * @param {string} separator
 * @param {string} stringData
 */
Message.prototype.addStringSeparatedOption =
  function(optionNumber, separator, stringData)
{
  var parts = stringData.split(separator);

  if (stringData.charAt(0) === separator)
  {
    parts.shift();
  }

  var message = this;

  parts.forEach(function addOptionForEachPart(part)
  {
    message.addOption(new Option(optionNumber, new Buffer(part)));
  });
};

module.exports = Message;
