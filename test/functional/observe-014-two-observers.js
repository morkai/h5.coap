/*
 Handle notifications of two different resources from the same remote endpoint:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe : 0
 Uri-Path: observer
 Uri-Path: 1
 ==============================================================================

 2. Server sends a piggy-backed response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0001
 1       | ACK  | 0 bytes      | 2.05 Content    | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 10
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 1
 ==============================================================================

 3. Client sends another request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 1 byte       | GET             | 1
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe : 0
 Uri-Path: observer
 Uri-Path: 2
 ==============================================================================

 4. Server sends a piggy-backed response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x0002
 1       | ACK  | 1 byte       | 2.05 Content    | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 10
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (3 bytes)
 one
 ==============================================================================

 3. Client receives the #2 response. The #1 request emits the `acknowledged`
 event and the `response` event.

 4. Client receives the 34 response. The #3 request emits the `acknowledged`
 event and the `response` event.

 5. After 2s, server sends a notification for /observer/1:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | CON  | 0 bytes      | 2.05 Content    | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 11
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 2
 ==============================================================================

 6. After 2.5s, server sends a notification for /observer/2:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x4322
 1       | CON  | 1 byte       | 2.05 Content    | 17186
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 11
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (3 bytes)
 two
 ==============================================================================

 5. Client receives the #6 notification and acknowledges it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 6. The #3 request emits the `response` event.

 7. Client receives the #5 notification and acknowledges it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 8. The #1 request emits the `response` event.

 9. Client cancels the observers. The #1 and the #3 request emit
 the `cancelled` event.

 10. Server sends another notification to the #1 observer:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4323
 1       | CON  | 0 bytes      | 2.05 Content    | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 12
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (1 byte)
 3
 ==============================================================================

 11. Client receives the #10 notification, but resets it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4323
 1       | RST  | 0 bytes      | Empty           | 17187
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 12. Server receives the #12 reset and removes the #1 observer.

 13. Server sends another notification to the #3 observer:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x4324
 1       | CON  | 1 byte       | 2.05 Content    | 17188
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 12
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (5 bytes)
 three
 ==============================================================================

 14. Client receives the #13 notification, but resets it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4324
 1       | RST  | 0 bytes      | Empty           | 17188
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 15. Server receives the #14 reset and removes the #3 observer.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:999*/

  var sub1Request = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/observer/1',
    observe: 0
  };
  var sub1Response = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: sub1Request.id,
    token: sub1Request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 10,
    payload: new Buffer('1')
  };
  var sub1Nft1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: sub1Request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 11,
    payload: new Buffer('2')
  };
  var sub1Nft1Ack = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: sub1Nft1.id
  };
  var sub1Nft2 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: sub1Request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 12,
    payload: new Buffer('3')
  };
  var sub1Nft2Rst = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: sub1Nft2.id
  };
  var sub2Request = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    token: new Buffer([0x01]),
    uri: '/observer/2',
    observe: 0
  };
  var sub2Response = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: sub2Request.id,
    token: sub2Request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 10,
    payload: new Buffer('one')
  };
  var sub2Nft1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4323,
    token: sub2Request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 11,
    payload: new Buffer('two')
  };
  var sub2Nft1Ack = {
    type: Message.Type.ACK,
    code: Message.Code.EMPTY,
    id: sub2Nft1.id
  };
  var sub2Nft2 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4324,
    token: sub2Request.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 12,
    payload: new Buffer('three')
  };
  var sub2Nft2Rst = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: sub2Nft2.id
  };

  ctx.socket.expectRequest(sub1Request);
  ctx.socket.expectRequest(sub2Request);
  ctx.socket.scheduleResponse(50, sub1Response);
  ctx.socket.scheduleResponse(75, sub2Response);
  ctx.socket.scheduleResponse(2050, sub2Nft1);
  ctx.socket.expectRequest(2050, sub2Nft1Ack);
  ctx.socket.scheduleResponse(2550, sub1Nft1);
  ctx.socket.expectRequest(2550, sub1Nft1Ack);
  ctx.socket.scheduleResponse(4050, sub1Nft2);
  ctx.socket.expectRequest(4050, sub1Nft2Rst);
  ctx.socket.scheduleResponse(4075, sub2Nft2);
  ctx.socket.expectRequest(4075, sub2Nft2Rst);

  var sub1Req = Message.fromObject(sub1Request);
  var sub2Req = Message.fromObject(sub2Request);

  var sub1EventSpy = sinon.spy(sub1Req, 'emit');
  var sub2EventSpy = sinon.spy(sub2Req, 'emit');

  ctx.client.request(sub1Req);
  ctx.client.request(sub2Req);

  setTimeout(
    function()
    {
      ctx.client.cancel(sub1Req);
      ctx.client.cancel(sub2Req);
    },
    3000
  );

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(sub1EventSpy, 4);
    sinon.assert.callCount(sub2EventSpy, 4);

    sinon.assert.calledWith(
      sub1EventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      sub1EventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(sub1EventSpy, 'cancelled');
    sinon.assert.calledWith(
      sub2EventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      sub2EventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(sub2EventSpy, 'cancelled');

    sub1EventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      sub1EventSpy.args[0][1],
      sub1Response,
      "Invalid `acknowledged` #1."
    );

    sub1EventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      sub1EventSpy.args[1][1],
      sub1Response,
      "Invalid `response` #1."
    );

    sub1EventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      sub1EventSpy.args[2][1],
      sub1Nft1,
      "Invalid `response` #2."
    );

    sub1EventSpy.args[3][0].should.be.equal('cancelled');

    sub2EventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      sub2EventSpy.args[0][1],
      sub2Response,
      "Invalid `acknowledged` #2."
    );

    sub2EventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      sub2EventSpy.args[1][1],
      sub2Response,
      "Invalid `response` #3."
    );

    sub2EventSpy.args[2][0].should.be.equal('response');
    sinon.assert.coapMessage(
      sub2EventSpy.args[2][1],
      sub2Nft1,
      "Invalid `response` #4."
    );

    sub2EventSpy.args[3][0].should.be.equal('cancelled');
  };
});
