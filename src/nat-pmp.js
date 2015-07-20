var utils = require('./utils');
var ipaddr = require('ipaddr.js');

/**
* Probe if NAT-PMP is supported by the router
* @public
* @method probePmpSupport
* @param {object} activeMappings Table of active Mappings
* @return {Promise<boolean>} A promise for a boolean
*/
var probePmpSupport = function (activeMappings) {
  return addMappingPmp(utils.NAT_PMP_PROBE_PORT, utils.NAT_PMP_PROBE_PORT, 120,
                       activeMappings).
      then(function (mapping) { return mapping.externalPort !== -1; });
};

/**
* Makes a port mapping in the NAT with NAT-PMP,
* and automatically refresh the mapping every two minutes
* @public
* @method addMappingPmp
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity, i.e. a refresh every 24 hours
* @param {object} activeMappings Table of active Mappings
* @return {Promise<Mapping>} A promise for the port mapping object
*                            Mapping.externalPort === -1 on failure
*/
var addMappingPmp = function (intPort, extPort, lifetime, activeMappings) {
  var mapping = new utils.Mapping();
  mapping.internalPort = intPort;
  mapping.protocol = 'natPmp';

  // If lifetime is zero, we want to refresh every 24 hours
  var reqLifetime = (lifetime === 0) ? 24*60*60 : lifetime;

  // Send NAT-PMP requests to ROUTER_IPS and parse the first response
  function _sendPmpRequests() {
    // Construct an array of ArrayBuffers, which are the responses of
    // sendPmpRequest() calls on all the router IPs. An error result
    // is caught and re-passed as null.
    return Promise.all(utils.ROUTER_IPS.map(function (routerIp) {
        return sendPmpRequest(routerIp, intPort, extPort, reqLifetime).
            then(function (pmpResponse) { return pmpResponse; }).
            catch(function (err) { return null; });
    // Check if any of the responses are successful (not null)
    // and parse the external port, router IP, and lifetime in the response
    })).then(function (responses) {
      for (var i = 0; i < responses.length; i++) {
        if (responses[i] !== null) {
          var responseView = new DataView(responses[i].data);
          mapping.externalPort = responseView.getUint16(10);
          mapping.lifetime = responseView.getUint32(12);
          return responses[i].address;  // Router's internal IP
        }
      }
    // Find the longest prefix match for all the client's internal IPs with
    // the router IP. This was the internal IP for the new mapping. (We want
    // to identify which network interface the socket bound to, since NAT-PMP
    // uses the request's source IP, not a specified one, for the mapping.)
    }).then(function (routerIntIp) {
      if (routerIntIp !== undefined) {
        return utils.getPrivateIps().then(function (privateIps) {
          mapping.internalIp = utils.longestPrefixMatch(privateIps, routerIntIp);
          return mapping;
        });
      } else {
        return mapping;
      }
    }).catch(function (err) {
      return mapping;
    });
  }

  // After receiving a NAT-PMP response, set timeouts to delete/refresh the 
  // mapping, add it to activeMappings, and return the mapping object
  return _sendPmpRequests().then(function (mapping) {
    // If the actual lifetime is less than the requested lifetime,
    // setTimeout to refresh the mapping when it expires
    var timeoutId;
    var dLifetime = reqLifetime - mapping.lifetime;
    if (mapping.externalPort !== -1 && dLifetime > 0) {
      timeoutId = setTimeout(addMappingPmp.bind({}, intPort,
        mapping.externalPort, dLifetime, activeMappings), mapping.lifetime*1000);
      mapping.timeoutId = timeoutId;
    }
    // If the original lifetime is 0, refresh every 24 hrs indefinitely
    else if (mapping.externalPort !== -1 && lifetime === 0) {
      timeoutId = setTimeout(addMappingPmp.bind({}, intPort,
        mapping.externalPort, 0, activeMappings), 24*60*60*1000);
      mapping.timeoutId = timeoutId;
    }
    // If we're not refreshing, delete the entry from activeMapping at expiration
    else if (mapping.externalPort !== -1) {
      setTimeout(function () {
        delete activeMappings[mapping.externalPort];
      }, mapping.lifetime*1000);
    }

    // If the mapping operation is successful, add it to activeMappings
    if (mapping.externalPort !== -1) {
      activeMappings[mapping.externalPort] = mapping;
    }
    return mapping;
  });
};

/**
* Deletes a port mapping in the NAT with NAT-PMP
* @public
* @method deleteMappingPmp
* @param {number} extPort The external port of the mapping to delete
* @param {object} activeMappings Table of active Mappings
* @return {Promise<boolean>} True on success, false on failure
*/
var deleteMappingPmp = function (extPort, activeMappings) {
  // Send NAT-PMP mapping deletion requests to ROUTER_IPS, and if that succeeds,
  // delete the corresponding Mapping object from activeMappings
  return new Promise(function (F, R) {
    // Retrieve internal port of this mapping; this may error
    F(activeMappings[extPort].internalPort);
  }).then(function (intPort) {
    // Construct an array of ArrayBuffers, which are the responses of
    // sendPmpRequest() calls on all the router IPs. An error result
    // is caught and re-passed as null.
    return Promise.all(utils.ROUTER_IPS.map(function (routerIp) {
      return sendPmpRequest(routerIp, intPort, 0, 0).
          then(function (pmpResponse) { return pmpResponse; }).
          catch(function (err) { return null; });
    }));
  }).then(function (responses) {
    // Return true if any of the responses are successful (not null)
    for (var i = 0; i < responses.length; i++) {
      if (responses[i] !== null) {
        // Check that the success code of the response is 0
        var responseView = new DataView(responses[i].data);
        var successCode = responseView.getUint16(2);
        if (successCode === 0) {
          clearTimeout(activeMappings[extPort].timeoutId);
          delete activeMappings[extPort];
          return true;
        }
      }
    }
    return false;
  }).catch(function (err) {
    return false;
  });
};

/**
* Send a NAT-PMP request to the router to add or delete a port mapping
* @private
* @method sendPmpRequest
* @param {string} routerIp The IP address that the router can be reached at
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
* @return {Promise<{"resultCode": number, "address": string, "port": number, "data": ArrayBuffer}>}
*         A promise that fulfills with the full NAT-PMP response object, or rejects on timeout
*/
var sendPmpRequest = function (routerIp, intPort, extPort, lifetime) {
  var socket;

  // Binds a socket and sends the NAT-PMP request from that socket to routerIp
  var _sendPmpRequest = new Promise(function (F, R) {
    socket = freedom['core.udpsocket']();

    // Fulfill when we get any reply (failure is on timeout in wrapper function)
    socket.on('onData', function (pmpResponse) {
      // We need to return the entire pmpResponse, not just the ArrayBuffer,
      // since we need the router's internal IP to guess the client's internal IP
      utils.closeSocket(socket);
      F(pmpResponse);
    });

    // TODO(kennysong): Handle an error case for all socket.bind() when this issue is fixed:
    // https://github.com/uProxy/uproxy/issues/1687

    // Bind a UDP port and send a NAT-PMP request
    socket.bind('0.0.0.0', 0).then(function (result) {
      // NAT-PMP packet structure: https://tools.ietf.org/html/rfc6886#section-3.3
      var pmpBuffer = utils.createArrayBuffer(12, [
        [8, 0, 0],
        [8, 1, 1],
        [16, 2, 0],
        [16, 4, intPort],
        [16, 6, extPort],
        [32, 8, lifetime]
      ]);
      socket.sendTo(pmpBuffer, routerIp, 5351);
    });
  });

  // Give _sendPmpRequest 2 seconds before timing out
  return Promise.race([
    utils.countdownReject(2000, 'No NAT-PMP response', function () {
      utils.closeSocket(socket);
    }),
    _sendPmpRequest
  ]);
};

module.exports = {
  probePmpSupport: probePmpSupport,
  addMappingPmp: addMappingPmp,
  deleteMappingPmp: deleteMappingPmp
};
