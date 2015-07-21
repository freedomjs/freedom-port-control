var utils = require('./utils');
var ipaddr = require('ipaddr.js');

/**
* Probe if NAT-PMP is supported by the router
* @public
* @method probeSupport
* @param {object} activeMappings Table of active Mappings
* @param {Array<string>} routerIpCache Router IPs that have previously worked
* @return {Promise<boolean>} A promise for a boolean
*/
var probeSupport = function (activeMappings, routerIpCache) {
  return addMapping(utils.NAT_PMP_PROBE_PORT, utils.NAT_PMP_PROBE_PORT, 120,
                       activeMappings, routerIpCache).
      then(function (mapping) { return mapping.externalPort !== -1; });
};

/**
* Makes a port mapping in the NAT with NAT-PMP,
* and automatically refresh the mapping every two minutes
* @public
* @method addMapping
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity, i.e. a refresh every 24 hours
* @param {object} activeMappings Table of active Mappings
* @param {Array<string>} routerIpCache Router IPs that have previously worked
* @return {Promise<Mapping>} A promise for the port mapping object
*                            Mapping.externalPort === -1 on failure
*/
var addMapping = function (intPort, extPort, lifetime, activeMappings, routerIpCache) {
  var mapping = new utils.Mapping();
  mapping.internalPort = intPort;
  mapping.protocol = 'natPmp';

  // If lifetime is zero, we want to refresh every 24 hours
  var reqLifetime = (lifetime === 0) ? 24*60*60 : lifetime;

  // Send NAT-PMP requests to a list of router IPs and parse the first response
  function _sendPmpRequests(routerIps) {
    // Construct an array of ArrayBuffers, which are the responses of
    // sendPmpRequest() calls on all the router IPs. An error result
    // is caught and re-passed as null.
    return Promise.all(routerIps.map(function (routerIp) {
        return sendPmpRequest(routerIp, intPort, extPort, reqLifetime).
            then(function (pmpResponse) { return pmpResponse; }).
            catch(function (err) { return null; });
    // Check if any of the responses are successful (not null)
    // and parse the external port, router IP, and lifetime in the response
    })).then(function (responses) {
      for (var i = 0; i < responses.length; i++) {
        if (responses[i] !== null) {
          var responseView = new DataView(responses[i]);
          mapping.externalPort = responseView.getUint16(10);
          mapping.lifetime = responseView.getUint32(12);

          var routerIntIp = routerIps[i];
          if (routerIpCache.indexOf(routerIntIp) === -1) {
            routerIpCache.push(routerIntIp);
          }
          return routerIntIp;
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
      }
      return mapping;
    }).catch(function (err) {
      return mapping;
    });
  }

  // Basically calls _sendPcpRequests on matchedRouterIps first, and if that 
  // doesn't work, calls it on otherRouterIps
  function _sendPmpRequestsInWaves() {
    return utils.getPrivateIps().then(function (privateIps) {
      // Try matchedRouterIps first (routerIpCache + router IPs that match the 
      // user's IPs), then otherRouterIps if it doesn't work. This avoids flooding
      // the local network with NAT-PMP requests
      var matchedRouterIps = utils.arrAdd(routerIpCache, utils.filterRouterIps(privateIps));
      var otherRouterIps = utils.arrDiff(utils.ROUTER_IPS, matchedRouterIps);
      return _sendPmpRequests(matchedRouterIps).then(function (mapping) {
        if (mapping.externalPort !== -1) { return mapping; }
        return _sendPmpRequests(otherRouterIps);
      });
    });
  }

  // Compare our requested parameters for the mapping with the response,
  // setting a refresh if necessary, and a timeout for deletion, and saving the 
  // mapping object to activeMappings if the mapping succeeded
  function _saveAndRefreshMapping(mapping) {
    // If the actual lifetime is less than the requested lifetime,
    // setTimeout to refresh the mapping when it expires
    var dLifetime = reqLifetime - mapping.lifetime;
    if (mapping.externalPort !== -1 && dLifetime > 0) {
      mapping.timeoutId = setTimeout(addMapping.bind({}, intPort,
        mapping.externalPort, dLifetime, activeMappings), mapping.lifetime*1000);
    }
    // If the original lifetime is 0, refresh every 24 hrs indefinitely
    else if (mapping.externalPort !== -1 && lifetime === 0) {
      mapping.timeoutId = setTimeout(addMapping.bind({}, intPort, 
                       mapping.externalPort, 0, activeMappings), 24*60*60*1000);
    }
    // If we're not refreshing, delete the entry from activeMapping at expiration
    else if (mapping.externalPort !== -1) {
      setTimeout(function () { delete activeMappings[mapping.externalPort]; }, 
                 mapping.lifetime*1000);
    }

    // If mapping succeeded, attach a deleter function and add to activeMappings
    if (mapping.externalPort !== -1) {
      mapping.deleter = deleteMapping.bind({}, mapping.externalPort, 
                                           activeMappings, routerIpCache);
      activeMappings[mapping.externalPort] = mapping;
    }
    return mapping;
  }

  // Try NAT-PMP requests to matchedRouterIps, then otherRouterIps. 
  // After receiving a NAT-PMP response, set timeouts to delete/refresh the 
  // mapping, add it to activeMappings, and return the mapping object
  return _sendPmpRequestsInWaves().then(_saveAndRefreshMapping);
};

/**
* Deletes a port mapping in the NAT with NAT-PMP
* @public
* @method deleteMapping
* @param {number} extPort The external port of the mapping to delete
* @param {object} activeMappings Table of active Mappings
* @param {Array<string>} routerIpCache Router IPs that have previously worked
* @return {Promise<boolean>} True on success, false on failure
*/
var deleteMapping = function (extPort, activeMappings, routerIpCache) {
  // Send NAT-PMP requests to a list of router IPs and parse the first response
  function _sendDeletionRequests(routerIps) {
    return new Promise(function (F, R) {
      // Retrieve internal port of this mapping; this may error
      F(activeMappings[extPort].internalPort);
    }).then(function (intPort) {
      // Construct an array of ArrayBuffers, which are the responses of
      // sendPmpRequest() calls on all the router IPs. An error result
      // is caught and re-passed as null.
      return Promise.all(routerIps.map(function (routerIp) {
        return sendPmpRequest(routerIp, intPort, 0, 0).
            then(function (pmpResponse) { return pmpResponse; }).
            catch(function (err) { return null; });
      }));
    });
  }

  // Basically calls _sendDeletionRequests on matchedRouterIps first, and if that 
  // doesn't work, calls it on otherRouterIps
  function _sendDeletionRequestsInWaves() {
    return utils.getPrivateIps().then(function (privateIps) {
      // Try matchedRouterIps first (routerIpCache + router IPs that match the 
      // user's IPs), then otherRouterIps if it doesn't work. This avoids flooding
      // the local network with PCP requests
      var matchedRouterIps = utils.arrAdd(routerIpCache, utils.filterRouterIps(privateIps));
      var otherRouterIps = utils.arrDiff(utils.ROUTER_IPS, matchedRouterIps);
      return _sendDeletionRequests(matchedRouterIps).then(function (mapping) {
        if (mapping.externalPort !== -1) { return mapping; }
        return _sendDeletionRequests(otherRouterIps);
      });
    });
  }

  // If any of the NAT-PMP responses were successful, delete the entry from 
  // activeMappings and return true
  function _deleteFromActiveMappings(responses) {
    for (var i = 0; i < responses.length; i++) {
      if (responses[i] !== null) {
        var responseView = new DataView(responses[i]);
        var successCode = responseView.getUint16(2);
        if (successCode === 0) {
          clearTimeout(activeMappings[extPort].timeoutId);
          delete activeMappings[extPort];
          return true;
        }
      }
    }
    return false;
  }

  // Send NAT-PMP deletion requests to matchedRouterIps, then otherRouterIps;
  // if that succeeds, delete the corresponding Mapping from activeMappings
  return _sendDeletionRequestsInWaves().
      then(_deleteFromActiveMappings).
      catch(function (err) { return false; });
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
      utils.closeSocket(socket);
      F(pmpResponse.data);
    });

    // TODO(kennysong): Handle an error case for all socket.bind() when this issue is fixed:
    // https://github.com/uProxy/uproxy/issues/1687

    // Bind a UDP port and send a NAT-PMP request
    socket.bind('0.0.0.0', 0).then(function (result) {
      // NAT-PMP packet structure: https://tools.ietf.org/html/rfc6886#section-3.3
      var pmpBuffer = utils.createArrayBuffer(12, [
        [8, 1, 1],
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
  probeSupport: probeSupport,
  addMapping: addMapping,
  deleteMapping: deleteMapping
};
