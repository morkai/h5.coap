/*globals describe:true,it:true*/
/*jshint maxlen:999*/

'use strict';

require('should');

var dgram = require('dgram');
var sinon = require('sinon');
var helpers = require('../helpers');
var coap = require(helpers.LIB_DIR);
var Message = coap.Message;
var Client = coap.Client;

describe("Client", function()
{
  it("should emit an Error if an invalid Message was received", function()
  {
    var socket4 = dgram.createSocket('udp4');
    var client = new Client({socket4: socket4});
    var errorSpy = sinon.spy();

    client.on('error', errorSpy);

    socket4.emit('message', new Buffer(5), {address: '127.0.0.1', port: 5683});

    sinon.assert.calledWith(errorSpy, sinon.match.instanceOf(Error));
  });

  describe("request", function()
  {
    it("should throw if the specified message isn't a Request", function()
    {
      var client = new Client();

      function testEmpty()
      {
        client.request(Message.fromObject({code: Message.Code.EMPTY}));
      }

      function testResponse()
      {
        client.request(Message.fromObject({code: Message.Code.CONTENT}));
      }

      function testRequest()
      {
        client.request(Message.fromObject({code: Message.Code.GET}));
      }

      testEmpty.should.throw();
      testResponse.should.throw();
      testRequest.should.not.throw();

      client.destroy();
    });

    it("should use the specified TokenManager", function()
    {
      var tokenManager = new coap.TokenManager();
      var acquireSpy = sinon.spy(tokenManager, 'acquire');
      var client = new Client({tokenManager: tokenManager});

      client.request(Message.fromObject({
        code: Message.Code.GET
      }));

      sinon.assert.calledOnce(acquireSpy);

      client.destroy();
    });

    it("should use the specified IPv4 socket", function()
    {
      var socket = dgram.createSocket('udp4');
      var socketSendSpy = sinon.spy(socket, 'send');
      var client = new Client({socket4: socket});

      client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/.well-known/core'
      }));

      sinon.assert.calledOnce(socketSendSpy);

      client.destroy();
    });

    it("should create an IPv4 socket by default", function()
    {
      var client = new Client();
      var emitSpy = sinon.spy(client, 'emit');

      var req = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/.well-known/core'
      }));

      sinon.assert.calledWith(emitSpy, 'message sent', req);
    });

    it("should defer emitting an error if the socket.send threw", function(done)
    {
      /*jshint unused:false*/

      var socket4 = dgram.createSocket('udp4');
      var error = new Error();
      var sendStub = sinon.stub(socket4, 'send').throws(error);
      var errorSpy = sinon.spy();
      var client = new Client({socket4: socket4});

      var req = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/.well-known/core'
      }));

      req.on('error', function(err)
      {
        err.should.be.equal(error);

        done();
      });

      client.destroy();
    });

    it("should defer emitting an error if sending IPv4 message and socket4 was disabled", function(done)
    {
      var client = new Client({socket4: false});

      var req = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/.well-known/core'
      }));

      req.on('error', function(err)
      {
        err.message.should.match(/Socket type not supported/);

        done();
      });

      client.destroy();
    });

    it("should use the specified IPv6 socket", function()
    {
      var socket = dgram.createSocket('udp6');
      var socketSendSpy = sinon.spy(socket, 'send');
      var client = new Client({socket6: socket});

      client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://[2222::1]/.well-known/core'
      }));

      sinon.assert.calledOnce(socketSendSpy);

      client.destroy();
    });

    it("should create an IPv6 socket by default", function()
    {
      var client = new Client();
      var emitSpy = sinon.spy(client, 'emit');

      var req = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://[2222::1]/.well-known/core'
      }));

      sinon.assert.calledWith(emitSpy, 'message sent', req);

      client.destroy();
    });

    it("should defer emitting an error if sending IPv6 message and socket6 was disabled", function(done)
    {
      var client = new Client({socket6: false});

      var req = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://[2222::1]/.well-known/core'
      }));

      req.on('error', function(err)
      {
        err.message.should.match(/Socket type not supported/);

        done();
      });

      client.destroy();
    });

    it("should set the next message ID for the specified requests", function()
    {
      var client = new Client({messageId: 1336});

      var req1 = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/foo'
      }));

      var req2 = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/bar'
      }));

      req1.getId().should.be.equal(1337);
      req2.getId().should.be.equal(1338);

      client.destroy();
    });

    it("should reset the message ID counter to 1 after reaching the max message ID", function()
    {
      var client = new Client({messageId: 0xFFFF - 1});

      var req1 = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/foo'
      }));

      var req2 = client.request(Message.fromObject({
        code: Message.Code.GET,
        uri: 'coap://127.0.0.1/bar'
      }));

      req1.getId().should.be.equal(0xFFFF);
      req2.getId().should.be.equal(0x0001);

      client.destroy();
    });
  });

  describe("cancel", function()
  {
    it("should do nothing if the specified message was not sent by the client", function()
    {
      var msg = new Message();
      var msgEmitSpy = sinon.spy(msg, 'emit');
      var client = new Client();
      var clientEmitSpy = sinon.spy(client, 'emit');

      client.cancel(msg);

      sinon.assert.notCalled(msgEmitSpy);
      sinon.assert.notCalled(clientEmitSpy);

      client.destroy();
    });
  });

  describe("get", function()
  {
    it("should request a GET Message", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var req = client.get('/.well-known/core');

      req.getCode().should.be.equal(Message.Code.GET);

      sinon.assert.calledWith(requestSpy, req);

      client.destroy();
    });

    it("should set the specified URI", function()
    {
      var client = new Client();
      var expectedUri = 'coap://192.168.1.105:1337/.well-known/core';

      var req = client.get(expectedUri);

      req.getUri().should.be.equal(expectedUri);

      client.destroy();
    });

    it("should pass the specified options to the request method", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var options = {};
      var req = client.get('/.well-known/core', options);

      sinon.assert.calledWith(requestSpy, req, options);

      client.destroy();
    });
  });

  describe("observe", function()
  {
    it("should request a GET Message", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var req = client.observe('/observer');

      req.getCode().should.be.equal(Message.Code.GET);

      sinon.assert.calledWith(requestSpy, req);

      client.destroy();
    });

    it("should set the specified URI", function()
    {
      var client = new Client();
      var expectedUri = 'coap://192.168.1.105:1337/observer';

      var req = client.observe(expectedUri);

      req.getUri().should.be.equal(expectedUri);

      client.destroy();
    });

    it("should pass the specified options to the request method", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var options = {};
      var req = client.observe('/observer', options);

      sinon.assert.calledWith(requestSpy, req, options);

      client.destroy();
    });

    it("should include an empty Observe option", function()
    {
      var client = new Client();

      var req = client.observe('/observer');

      req.getObserve().should.be.equal(0);

      client.destroy();
    });
  });

  describe("post", function()
  {
    it("should request a POST Message", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var req = client.post('/large', 'test');

      req.getCode().should.be.equal(Message.Code.POST);

      sinon.assert.calledWith(requestSpy, req);

      client.destroy();
    });

    it("should set the specified URI", function()
    {
      var client = new Client();
      var expectedUri = 'coap://192.168.1.105:1337/large';

      var req = client.post(expectedUri, 'test');

      req.getUri().should.be.equal(expectedUri);

      client.destroy();
    });

    it("should set the specified string payload", function()
    {
      var client = new Client();
      var expectedPayload = 'foobar';

      var req = client.post('/large', expectedPayload);

      req.getPayload().toString().should.be.equal(expectedPayload);

      client.destroy();
    });

    it("should set the specified Buffer payload", function()
    {
      var client = new Client();
      var expectedPayload = new Buffer('foobar');

      var req = client.post('/large', expectedPayload);

      req.getPayload().should.be.eql(expectedPayload);

      client.destroy();
    });

    it("should pass the specified options to the request method", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var options = {};
      var req = client.post('/large', 'test', options);

      sinon.assert.calledWith(requestSpy, req, options);

      client.destroy();
    });
  });

  describe("put", function()
  {
    it("should request a PUT Message", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var req = client.put('/large', 'test');

      req.getCode().should.be.equal(Message.Code.PUT);

      sinon.assert.calledWith(requestSpy, req);

      client.destroy();
    });

    it("should set the specified URI", function()
    {
      var client = new Client();
      var expectedUri = 'coap://192.168.1.105:1337/large';

      var req = client.put(expectedUri, 'test');

      req.getUri().should.be.equal(expectedUri);

      client.destroy();
    });

    it("should set the specified string payload", function()
    {
      var client = new Client();
      var expectedPayload = 'foobar';

      var req = client.put('/large', expectedPayload);

      req.getPayload().toString().should.be.equal(expectedPayload);

      client.destroy();
    });

    it("should set the specified Buffer payload", function()
    {
      var client = new Client();
      var expectedPayload = new Buffer('foobar');

      var req = client.put('/large', expectedPayload);

      req.getPayload().should.be.eql(expectedPayload);

      client.destroy();
    });

    it("should pass the specified options to the request method", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var options = {};
      var req = client.put('/large', 'test', options);

      sinon.assert.calledWith(requestSpy, req, options);

      client.destroy();
    });
  });

  describe("del", function()
  {
    it("should request a DELETE Message", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var req = client.del('/large');

      req.getCode().should.be.equal(Message.Code.DELETE);

      sinon.assert.calledWith(requestSpy, req);

      client.destroy();
    });

    it("should set the specified URI", function()
    {
      var client = new Client();
      var expectedUri = 'coap://192.168.1.105:1337/large';

      var req = client.del(expectedUri);

      req.getUri().should.be.equal(expectedUri);

      client.destroy();
    });

    it("should pass the specified options to the request method", function()
    {
      var client = new Client();
      var requestSpy = sinon.spy(client, 'request');

      var options = {};
      var req = client.del('/large', options);

      sinon.assert.calledWith(requestSpy, req, options);

      client.destroy();
    });
  });
});
