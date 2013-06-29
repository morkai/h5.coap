/*
 Handle a response with a single Block2 to a confirmable GET request
 with a Block2 option:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: single
 Block2  : NUM: 0, M: false, SZX: 5 (512 bytes)
 ==============================================================================

 2. Server sends the first (and last) block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0001
 1       | ACK  | 0 bytes      | 2.05 Content    | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 0, M: false, SZX: 5 (512 bytes)
 ------------------------------------------------------------------------------
 Payload (191 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |
 |-------------------------------------------------------------|
 ==============================================================================

 3. Client receives the #2 response. Request emits the `acknowledged` event,
 the `block received` event and the `response` event.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var request = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    uri: '/blocks/single'
  };
  var expectedReqForBlock0 = {
    type: request.type,
    code: request.code,
    id: request.id,
    uri: request.uri,
    block2: {num: 0, m: false, size: 512}
  };
  var expectedResWithBlock0 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: 0x0001,
    block2: {num: 0, m: false, size: 512},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 1                           |\n' +
      '|-------------------------------------------------------------|\n'
    )
  };

  ctx.socket.expectRequest(expectedReqForBlock0);
  ctx.socket.scheduleResponse(50, expectedResWithBlock0);

  var req = ctx.client.request(Message.fromObject(request), {
    blockSize: 512
  });

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 3);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'block received', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], expectedResWithBlock0, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], expectedResWithBlock0, "Invalid `block received`."
    );

    eventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[2][1], expectedResWithBlock0, "Invalid `response`."
    );
  };
});
