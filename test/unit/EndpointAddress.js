/*globals describe:true,it:true*/
/*jshint maxlen:999*/

'use strict';

require('should');

var helpers = require('../helpers');
var EndpointAddress = require(helpers.LIB_DIR + '/EndpointAddress');

describe("EndpointAddress", function()
{
  var expandedIpv6 = '2222:0000:0000:0000:0000:0000:0000:0003';
  var expandTests = {
    '::': '0000:0000:0000:0000:0000:0000:0000:0000',
    '1::': '0001:0000:0000:0000:0000:0000:0000:0000',
    '::1': '0000:0000:0000:0000:0000:0000:0000:0001',
    '1::2': '0001:0000:0000:0000:0000:0000:0000:0002',
    '1:2::2': '0001:0002:0000:0000:0000:0000:0000:0002',
    '1111::2222': '1111:0000:0000:0000:0000:0000:0000:2222',
    '111:02::3': '0111:0002:0000:0000:0000:0000:0000:0003',
    '1000:100:10:1::': '1000:0100:0010:0001:0000:0000:0000:0000',
    '::0:00:000:0000:1234': '0000:0000:0000:0000:0000:0000:0000:1234',
    '1:2:3:4:5:6:7:8': '0001:0002:0003:0004:0005:0006:0007:0008',
    '1111:2222:3333:4444:5555:6666:7777:8888': '1111:2222:3333:4444:5555:6666:7777:8888'
  };

  Object.keys(expandTests).forEach(function(input)
  {
    var expected = expandTests[input];

    it("should expand [" + input + "] to [" + expected + "]", function()
    {
      var actual = new EndpointAddress(input).getAddress();

      actual.should.be.equal(expected);
    });
  });

  describe("toString", function()
  {
    it("should not include a default port for IPv4 addresses", function()
    {
      var expected = '127.0.0.1';
      var actual = new EndpointAddress('127.0.0.1').toString();

      actual.should.be.equal(expected);
    });

    it("should not include a default port for IPv6 addresses", function()
    {
      var expected = '[' + expandedIpv6 + ']';
      var actual = new EndpointAddress('2222::3').toString();

      actual.should.be.equal(expected);
    });

    it("should include the specified port for IPv4 addresses", function()
    {
      var expected = '127.0.0.1:1337';
      var actual = new EndpointAddress('127.0.0.1', 1337).toString();

      actual.should.be.equal(expected);
    });

    it("should not include a default port for IPv6 addresses", function()
    {
      var expected = '[' + expandedIpv6 + ']:1337';
      var actual = new EndpointAddress('2222::3', 1337).toString();

      actual.should.be.equal(expected);
    });
  });

  describe("toJSON", function()
  {
    it("should return an object with `address` and `port` properties", function()
    {
      var expected = {address: '127.0.0.1', port: 1337};
      var actual = new EndpointAddress('127.0.0.1', 1337).toJSON();

      actual.should.be.eql(expected);
    });

    it("should include the default port", function()
    {
      var expected = {address: '127.0.0.1', port: 5683};
      var actual = new EndpointAddress('127.0.0.1').toJSON();

      actual.should.be.eql(expected);
    });

    it("should not enclose an IPv6 address in square brackets", function()
    {
      var expected = {address: expandedIpv6, port: 1337};
      var actual = new EndpointAddress('2222::3', 1337).toJSON();

      actual.should.be.eql(expected);
    });
  });

  describe("getAddress", function()
  {
    it("should return an address specified in the constructor", function()
    {
      var expected = '127.0.0.1';
      var actual = new EndpointAddress('127.0.0.1', 1337).getAddress();

      actual.should.be.equal(expected);
    });
  });

  describe("getPort", function()
  {
    it("should return a default port if one wasn't specified in the constructor", function()
    {
      var expected = 5683;
      var actual = new EndpointAddress('127.0.0.1').getPort();

      actual.should.be.equal(expected);
    });

    it("should return a port specified in the constructor", function()
    {
      var expected = 1337;
      var actual = new EndpointAddress('127.0.0.1', 1337).getPort();

      actual.should.be.equal(expected);
    });
  });

  describe("isIPv6", function()
  {
    it("should return `true` if the specified address contains the `:` character", function()
    {
      var expected = true;
      var actual = new EndpointAddress('2222::3').isIPv6();

      actual.should.be.equal(expected);
    });

    it("should return `false` if the specified address doesn't contain the `:` character", function()
    {
      var expected = false;
      var actual = new EndpointAddress('127.0.0.1').isIPv6();

      actual.should.be.equal(expected);
    });
  });
});
