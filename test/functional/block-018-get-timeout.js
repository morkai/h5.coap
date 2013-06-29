/*
 Handle a timeout of a blockwise GET request:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 ==============================================================================

 2. Server sends the first block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 1 0  | 0 0 0 0      | 0 1 0 0 0 1 0 1 | 0x0001
 1       | ACK  | 0 bytes      | 2.05 Content    | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Content-Format: text/plain;charset=utf-8
 Block2        : NUM: 0, M: true, SZX: 3 (128 bytes)
 ------------------------------------------------------------------------------
 Payload (128 bytes)
 |-------------------------------------------------------------|
 |                           BLOCK 1                           |

 ==============================================================================

 3. Client receives the #2 block. The #1 request emits the `acknowledged` event
 and the `block received` event.

 4. Client sends a request for the second block:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0002
 1       | CON  | 0 bytes      | GET             | 2
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: blocks
 Uri-Path: get
 Block2  : NUM: 1, M: false, SZX: 3 (128 bytes)
 ==============================================================================

 5. The #4 request is lost along the way...

 6. Client retransmits the #4 request (1)...

 7. The request is lost again...

 8. Client retransmits the #4 request (2)...

 9. The request is lost again...

 10. Client retransmits the #4 request (3)...

 11. The request is lost again...

 12. Client retransmits the #4 request (4)...

 13. The request is lost again...

 14. Client emits the `transaction timeout` event and the #1 request emits
 the `timeout` event.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var expectedRequest = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    uri: '/blocks/get',
    id: 0x0001
  };
  var expectedResWithBlock0 = {
    type: Message.Type.ACK,
    code: Message.Code.CONTENT,
    id: expectedRequest.id,
    block2: {num: 0, m: true, size: 128},
    contentFormat: 'text/plain;charset=utf-8',
    payload: new Buffer(
      '|-------------------------------------------------------------|\n' +
      '|                           BLOCK 1                           |\n'
    )
  };
  var expectedReqForBlock1 = {
    type: Message.Type.CON,
    code: Message.Code.GET,
    id: 0x0002,
    uri: '/blocks/get',
    block2: {num: 1, m: false, size: 128}
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.scheduleResponse(50, expectedResWithBlock0);
  ctx.socket.expectRequest(50, expectedReqForBlock1);
  ctx.socket.expectRequest(50 + 2000, expectedReqForBlock1);
  ctx.socket.expectRequest(2050 + 4000, expectedReqForBlock1);
  ctx.socket.expectRequest(6050 + 8000, expectedReqForBlock1);
  ctx.socket.expectRequest(14050 + 16000, expectedReqForBlock1);

  var req = ctx.client.request(Message.fromObject(expectedRequest));

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
      eventSpy, 'timeout'
    );

    eventSpy.args[0][0].should.be.equal('acknowledged');
    sinon.assert.coapMessage(
      eventSpy.args[0][1], expectedResWithBlock0, "Invalid ACK."
    );

    eventSpy.args[1][0].should.be.equal('block received');
    sinon.assert.coapMessage(
      eventSpy.args[1][1],
      expectedResWithBlock0,
      "Invalid `block received` (#1)."
    );

    eventSpy.args[2][0].should.be.equal('timeout');
  };
});
