/*
 Handle a re-registration of an observer after Max-Age ends after a successful
 blockwise notification:

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
 Uri-Path: blocks
 Uri-Path: expire
 ==============================================================================

 2. Server receives the request, registers a new observer and sends
 a piggy-backed response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0001
 1       | ACK  | 0 bytes      | 2.05 Content    | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 1
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 1111111111111111
 ==============================================================================

 3. Client receives the #2 response. The #1 request emits the `acknowledged`
 event and the `response` event.

 4. After 2s, server sends the first block of the notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4321
 1       | CON  | 0 bytes      | 2.05 Content    | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 Block2        : NUM: 0, M: true, SZX: 0 (16 bytes)
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 1111111111111111
 ==============================================================================

 5. Client receives the #4 block and sends an acknowledgement:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4321
 1       | ACK  | 0 bytes      | Empty           | 17185
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 6. The #1 request emits the `block received` event.

 7. Server receives the #5 acknowledgement and sends the next block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x4322
 1       | CON  | 0 bytes      | 2.05 Content    | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 Block2        : NUM: 1, M: false, SZX: 0 (16 bytes)
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 2222222222222222
 ==============================================================================

 7. Client receives the #7 block and sends an acknowledgement:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x4322
 1       | ACK  | 0 bytes      | Empty           | 17186
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ==============================================================================

 8. The #1 request emits the `block received` event and the `response` event.

 9. Server reboots (observer state is lost)...

 10. Client waits 10 seconds (Max-Age) for the next notification...

 11. After 10s, client emits the `exchange timeout` event and the #1 request
 emits the `timeout` event.

 12. Client resends the #1 request with an updated message ID and token
 (a new exchange is created):
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 1 byte       | GET             | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe : 0
 Uri-Path: observer
 Uri-Path: blocks
 Uri-Path: timeout
 ==============================================================================

 13. Server receives the #12 request, registers a new observer and send
 a piggy-backed response:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x0002
 1       | ACK  | 1 byte       | 2.05 Content    | 2
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 1
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 1111111111111111
 ==============================================================================

 14. Client receives the #13 response. The #12 request emits the `acknowledged`
 and the `response` event.

 15. Client cancels the #12 observer. The #12 request emits the `cancelled`
 event.

 16. Server sends a notification:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 1      | 0 1 0 0 0 1 0 1 | 0x1337
 1       | CON  | 1 byte       | 2.05 Content    | 4919
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ------------------------------------------------------------------------------
 Observe       : 2
 Content-Format: text/plain;charset=utf-8
 Max-Age       : 10
 ------------------------------------------------------------------------------
 Payload (16 bytes)
 2222222222222222
 ==============================================================================

 17. Client receives the #16 notification, but resets it:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 1  | 0 0 0 0      | 0 0 0 0 0 0 0 0 | 0x1338
 1       | RST  | 0 bytes      | Empty           | 4920
 ------------------------------------------------------------------------------
 Token | Remote Endpoint
 01    | 127.0.0.1
 ==============================================================================

 18. Server receives the #17 reset and removes the #12 observer.

 19. No more notifications are sent.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  /*jshint maxstatements:999*/

  var subRequest1 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0001,
    token: new Buffer([]),
    uri: '/observer/blocks/expire',
    observe: 0
  };
  var subResponse1 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: subRequest1.id,
    token: subRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 1,
    payload: new Buffer('1111111111111111')
  };
  var nft1Block0 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4321,
    token: subRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    block2: {num: 0, m: true, szx: 0},
    payload: new Buffer('1111111111111111')
  };
  var nft1Block0Ack = {
    type: Message.Type.ACK,
    code: Message.Type.EMPTY,
    id: nft1Block0.id
  };
  var nft1Block1 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x4322,
    token: subRequest1.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    block2: {num: 1, m: false, szx: 0},
    payload: new Buffer('2222222222222222')
  };
  var nft1Block1Ack = {
    type: Message.Type.ACK,
    code: Message.Type.EMPTY,
    id: nft1Block1.id
  };
  var nft1 = {
    type: nft1Block1.type,
    code: nft1Block1.code,
    id: nft1Block1.id,
    token: nft1Block1.token,
    contentFormat: nft1Block1.contentFormat,
    maxAge: nft1Block1.maxAge,
    observe: nft1Block1.observe,
    block2: nft1Block1.block2,
    payload: Buffer.concat([nft1Block0.payload, nft1Block1.payload])
  };
  var subRequest2 = {
    type: subRequest1.type,
    code: subRequest1.code,
    id: 0x0002,
    token: new Buffer([0x01]),
    uri: subRequest1.uri,
    observe: subRequest1.observe
  };
  var subResponse2 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: subRequest2.id,
    token: subRequest2.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 1,
    payload: new Buffer('1111111111111111')
  };
  var nft2 = {
    type: Message.Type.CON,
    code: Message.Code.CONTENT,
    id: 0x1337,
    token: subRequest2.token,
    contentFormat: 'text/plain;charset=utf-8',
    maxAge: 10,
    observe: 2,
    payload: new Buffer('2222222222222222')
  };
  var nft2Rst = {
    type: Message.Type.RST,
    code: Message.Code.EMPTY,
    id: nft2.id
  };

  ctx.socket.expectRequest(subRequest1);
  ctx.socket.scheduleResponse(50, subResponse1);
  ctx.socket.scheduleResponse(2050, nft1Block0);
  ctx.socket.expectRequest(2050, nft1Block0Ack);
  ctx.socket.scheduleResponse(2075, nft1Block1);
  ctx.socket.expectRequest(2075, nft1Block1Ack);
  ctx.socket.expectRequest(2075 + 10000, subRequest2);
  ctx.socket.scheduleResponse(12075 + 50, subResponse2);
  ctx.socket.scheduleResponse(12125 + 2000, nft2);
  ctx.socket.expectRequest(14125, nft2Rst);

  var req = ctx.client.request(Message.fromObject(subRequest1));

  setTimeout(function() { ctx.client.cancel(req); }, 2075 + 10000 + 1000);

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();

    sinon.assert.callCount(eventSpy, 9);

    sinon.assert.calledWith(
      eventSpy, 'acknowledged', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'response', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(
      eventSpy, 'block received', sinon.match.instanceOf(Message)
    );
    sinon.assert.calledWith(eventSpy, 'timeout');
    sinon.assert.calledWith(eventSpy, 'cancelled');

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], subResponse1, "Invalid `acknowledged` #1."
    );

    eventSpy.args[1][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[1][1], subResponse1, "Invalid `response` #1."
    );

    eventSpy.args[2][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[2][1], nft1Block0, "Invalid `block received` #1."
    );

    eventSpy.args[3][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[3][1], nft1Block1, "Invalid `block received` #2."
    );

    eventSpy.args[4][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[4][1], nft1, "Invalid `response` #2."
    );

    eventSpy.args[5][0].should.be.equal('timeout');

    eventSpy.args[6][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[6][1], subResponse2, "Invalid `acknowledged` #2."
    );

    eventSpy.args[7][0].should.be.equal('response');
    sinon.assert.coapMessage(
      eventSpy.args[7][1], subResponse2, "Invalid `response` #3."
    );

    eventSpy.args[8][0].should.be.equal('cancelled');
  };
});
