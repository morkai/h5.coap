'use strict';

/**
 * @constructor
 * @param {string} address
 * @param {number} [port]
 */
function EndpointAddress(address, port)
{
  /**
   * @private
   * @type {string}
   */
  this.address = address;

  /**
   * @private
   * @type {number}
   */
  this.port = Number(port || EndpointAddress.DEFAULT_PORT);
}

/**
 * @const
 * @type {number}
 */
EndpointAddress.DEFAULT_PORT = 5683;

/**
 * @returns {string}
 */
EndpointAddress.prototype.toString = function()
{
  var str = this.isIPv6()
    ? '[' + this.address + ']'
    : this.address;

  if (this.port !== EndpointAddress.DEFAULT_PORT)
  {
    str += ':' + this.port;
  }

  this.toString = function() { return str; };

  return str;
};

/**
 * @returns {{address: string, port: number}}
 */
EndpointAddress.prototype.toJSON = function()
{
  return {
    address: this.address,
    port: this.port
  };
};

/**
 * @returns {string}
 */
EndpointAddress.prototype.getAddress = function()
{
  return this.address;
};

/**
 * @returns {number}
 */
EndpointAddress.prototype.getPort = function()
{
  return this.port;
};

/**
 * @returns {boolean}
 */
EndpointAddress.prototype.isIPv6 = function()
{
  return this.address.indexOf(':') !== -1;
};

module.exports = EndpointAddress;
