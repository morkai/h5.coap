/*
 Handle an exchange timeout for a non-confirmable GET request:

 1. Client sends a request:
 ==============================================================================
 Version | Type | Token Length | Code            | Message ID
 0 1     | 0 1  | 0 0 0 0      | 0 0 0 0 0 0 0 1 | 0x0001
 1       | NON  | 0 bytes      | GET             | 1
 ------------------------------------------------------------------------------
 Remote Endpoint: 127.0.0.1
 ------------------------------------------------------------------------------
 Uri-Path: temperature
 ==============================================================================

 2. The #1 request is lost along the way...

 3. ...client waits 64s and emits the `exchange timeout` event and the request
 emits the `timeout` event.
*/

'use strict';

require('should');

var sinon = require('sinon');
var helpers = require('../helpers');
var Message = require(helpers.LIB_DIR).Message;

helpers.test(__filename, function(ctx)
{
  var expectedRequest = {
    type: Message.Type.NON,
    code: Message.Code.GET,
    id: 0x0001,
    uri: '/temperature'
  };

  ctx.socket.expectRequest(expectedRequest);

  var clientEventSpy = sinon.spy(ctx.client, 'emit');

  var req = ctx.client.request(Message.fromObject(expectedRequest));

  var eventSpy = sinon.spy(req, 'emit');

  ctx.clock.tick(3600000);

  return function assert()
  {
    ctx.socket.assert();
    sinon.assert.calledWithExactly(clientEventSpy, 'exchange timeout', req);
    sinon.assert.calledAt(clientEventSpy, ctx.startTime + 64000);
    sinon.assert.callCount(eventSpy, 1);
    sinon.assert.calledWith(eventSpy, 'timeout');
  };
});
