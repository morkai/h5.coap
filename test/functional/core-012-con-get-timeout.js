/*
 Handle a transaction timeout for a confirmable GET request:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 0  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | CON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: temperature
 ==============================================================================

 2. The #1 request is lost along the way...

 3. ...client waits 2s and retransmits the #1 request for the first time.

 4. The #1 request is lost along the way...

 5. ...client waits 4s and retransmits the #1 request for the second time.

 6. The #1 request is lost along the way...

 7. ...client waits 8s and retransmits the #1 request for the third time.

 8. The #1 request is lost along the way...

 9. ...client waits 16s and retransmits the #1 request for the fourth time.

 10. The #1 request is lost along the way...

 11. ...client waits 32s (62s total) and emits the `transaction timeout` event
 and the request emits the `timeout` event.
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
    id: 0x0001,
    uri: '/temperature'
  };

  ctx.socket.expectRequest(expectedRequest);
  ctx.socket.expectRequest(2000, expectedRequest);          // Retransmit #1
  ctx.socket.expectRequest(2000 + 4000, expectedRequest);   // Retransmit #2
  ctx.socket.expectRequest(6000 + 8000, expectedRequest);   // Retransmit #3
  ctx.socket.expectRequest(14000 + 16000, expectedRequest); // Retransmit #4

  var clientEventSpy = sinon.spy(ctx.client, 'emit');

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  var reqEventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();
    sinon.assert.calledWithExactly(clientEventSpy, 'transaction timeout', req);
    sinon.assert.calledAt(clientEventSpy, 6, ctx.startTime + 62000);
    sinon.assert.callCount(reqEventSpy, 1);
    sinon.assert.calledWith(reqEventSpy, 'timeout');
  };
});
