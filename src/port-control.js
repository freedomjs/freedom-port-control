var ipaddr = require('ipaddr.js');
var utils = require('./utils');
var natPmp = require('./nat-pmp');
var pcp = require('./pcp');
var upnp = require('./upnp');

var PortControl = function (dispatchEvent) {
  this.dispatchEvent = dispatchEvent;
};

/**
* A table that keeps track of information about active Mappings
* The Mapping type is defined in utils.js
* { externalPortNumber1: Mapping1,
*   externalPortNumber2: Mapping2,
*   ...
* }
*/
PortControl.prototype.activeMappings = {};

/**
 * An array of previous router IPs that have worked; we try these first when
 * sending NAT-PMP and PCP requests
 */
PortControl.prototype.routerIpCache = [];

/**
 * An object that keeps track of which protocols are supported
 * This is updated every time this.probeProtocolSupport() is called
 * @property {boolean} natPmp A boolean stating if NAT-PMP is supported
 * @property {boolean} pcp A boolean stating if PCP is supported
 * @property {boolean} upnp A boolean stating if UPnP is supported
  * @property {string} [upnpControlUrl] The UPnP router's control URL
 */
PortControl.prototype.protocolSupportCache = {
  natPmp: undefined,
  pcp: undefined,
  upnp: undefined,
  upnpControlUrl: undefined
};

/**
* Add a port mapping through the NAT, using a protocol that probeProtocolSupport()
* found. If probeProtocolSupport() has not been previously called, i.e.
* protocolSupportCache is empty, then we try each protocol until one works
* @public
* @method addMapping
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity; handled differently per protocol
* @return {Promise<Mapping>} A promise for the port mapping object
*                            Mapping.externalPort === -1 on failure
**/
PortControl.prototype.addMapping = function (intPort, extPort, lifetime) {
  var _this = this;

  if (_this.protocolSupportCache.natPmp === undefined) {
    // We have no data in the protocolSupportCache,
    // so try to open a port with NAT-PMP, then PCP, then UPnP in that order
    return _this.addMappingPmp(intPort, extPort, lifetime).
      then(function (mapping) {
        if (mapping.externalPort !== -1) {
          return mapping;
        }
        return _this.addMappingPcp(intPort, extPort, lifetime);
      }).
      then(function (mapping) {
        if (mapping.externalPort !== -1) {
          return mapping;
        }
        return _this.addMappingUpnp(intPort, extPort, lifetime);
      });
  } else {
    // We have data from probing the router for protocol support,
    // so we can directly try one protocol, or return a failure Mapping
    if (_this.protocolSupportCache.natPmp) {
      return _this.addMappingPmp(intPort, extPort, lifetime);
    } else if (_this.protocolSupportCache.pcp) {
      return _this.addMappingPcp(intPort, extPort, lifetime);
    } else if (_this.protocolSupportCache.upnp) {
      return _this.addMappingUpnp(intPort, extPort, lifetime,
                                  _this.protocolSupportCache.upnpControlUrl);
    } else {
      var failureMapping = new utils.Mapping();
      failureMapping.errInfo = "No protocols are supported from last probe";
      return failureMapping;
    }
  }
};

/**
* Delete the port mapping locally and from the router (and stop refreshes)
* The port mapping must have a Mapping object in this.activeMappings
* @public
* @method deleteMapping
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
**/
PortControl.prototype.deleteMapping = function (extPort) {
  var mapping = this.activeMappings[extPort];
  if (mapping === undefined) {
    return Promise.resolve(false);
  }
  return mapping.deleter();
};

/**
* Probes the NAT for NAT-PMP, PCP, and UPnP support,
* and returns an object representing the NAT configuration
* Don't run probe before trying to map a port; instead, just try to map the port
* @public
* @method probeProtocolSupport
* @return {Promise<{"natPmp": boolean, "pcp": boolean, "upnp": boolean}>}
*/
PortControl.prototype.probeProtocolSupport = function () {
  var _this = this;

  return Promise.all([this.probePmpSupport(), this.probePcpSupport(),
    this.probeUpnpSupport(), this.getUpnpControlUrl()]).then(function (support) {
      _this.protocolSupportCache.natPmp = support[0];
      _this.protocolSupportCache.pcp = support[1];
      _this.protocolSupportCache.upnp = support[2];
      _this.protocolSupportCache.upnpControlUrl = support[3];

      return {
        natPmp: support[0],
        pcp: support[1],
        upnp: support[2]
      };
    });
};

/**
* Probe if NAT-PMP is supported by the router
* @public
* @method probePmpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probePmpSupport = function () {
  return natPmp.probeSupport(this.activeMappings, this.routerIpCache);
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
* @return {Promise<Mapping>} A promise for the port mapping object
*                            Mapping.externalPort === -1 on failure
*/
PortControl.prototype.addMappingPmp = function (intPort, extPort, lifetime) {
  return natPmp.addMapping(intPort, extPort, lifetime, this.activeMappings,
                           this.routerIpCache);
};

/**
* Deletes a port mapping in the NAT with NAT-PMP
* The port mapping must have a Mapping object in this.activeMappings
* @public
* @method deleteMappingPmp
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
*/
PortControl.prototype.deleteMappingPmp = function (extPort) {
  var mapping = this.activeMappings[extPort];
  if (mapping === undefined || mapping.protocol !== 'natPmp') {
    return Promise.resolve(false);
  }
  return mapping.deleter();
};

/**
* Probe if PCP is supported by the router
* @public
* @method probePcpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probePcpSupport = function () {
  return pcp.probeSupport(this.activeMappings, this.routerIpCache);
};

/**
* Makes a port mapping in the NAT with PCP,
* and automatically refresh the mapping every two minutes
* @public
* @method addMappingPcp
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity, i.e. a refresh every 24 hours
* @return {Promise<Mapping>} A promise for the port mapping object
*                            mapping.externalPort is -1 on failure
*/
PortControl.prototype.addMappingPcp = function (intPort, extPort, lifetime) {
  return pcp.addMapping(intPort, extPort, lifetime, this.activeMappings,
                        this.routerIpCache);
};

/**
* Deletes a port mapping in the NAT with PCP
* The port mapping must have a Mapping object in this.activeMappings
* @public
* @method deleteMappingPcp
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
*/
PortControl.prototype.deleteMappingPcp = function (extPort) {
  var mapping = this.activeMappings[extPort];
  if (mapping === undefined || mapping.protocol !== 'pcp') {
    return Promise.resolve(false);
  }
  return mapping.deleter();
};

/**
* Probe if UPnP AddPortMapping is supported by the router
* @public
* @method probeUpnpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probeUpnpSupport = function () {
  return upnp.probeSupport(this.activeMappings);
};

/**
* Makes a port mapping in the NAT with UPnP AddPortMapping
* @public
* @method addMappingUpnp
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity; a static AddPortMapping request
* @param {string=} controlUrl Optional: a control URL for the router
* @return {Promise<Mapping>} A promise for the port mapping object
*                               mapping.externalPort is -1 on failure
*/
PortControl.prototype.addMappingUpnp = function (intPort, extPort, lifetime,
                                                 controlUrl) {
  return upnp.addMapping(intPort, extPort, lifetime, this.activeMappings,
                         controlUrl);
};

/**
* Deletes a port mapping in the NAT with UPnP DeletePortMapping
* The port mapping must have a Mapping object in this.activeMappings
* @public
* @method deleteMappingUpnp
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
*/
PortControl.prototype.deleteMappingUpnp = function (extPort) {
  var mapping = this.activeMappings[extPort];
  if (mapping === undefined || mapping.protocol !== 'upnp') {
    return Promise.resolve(false);
  }
  return mapping.deleter();
};

/**
 * Return the UPnP control URL of a router on the network that supports UPnP IGD
 * @public
 * @method getUpnpControlUrl
 * @return {Promise<string>} A promise for the URL, empty string if not supported
 */
PortControl.prototype.getUpnpControlUrl = function () {
  return upnp.getUpnpControlUrl();
};

/**
* Returns the current value of activeMappings
* @public
* @method getActiveMappings
* @return {Promise<activeMappings>} A promise that resolves to activeMappings
*/
PortControl.prototype.getActiveMappings = function () {
  return Promise.resolve(this.activeMappings);
};

/**
* Return the router IP cache
* @public
* @method getRouterIpCache
* @return {Promise<Array<string>>} A promise that resolves to routerIpCache
*/
PortControl.prototype.getRouterIpCache = function () {
  return Promise.resolve(this.routerIpCache);
};

/**
 * Return the protocol support cache
 * @public
 * @method getProtocolSupportCache
 * @return {Promise<protocolSupportCache>} A promise that resolves to protocolSupportCache
 */
PortControl.prototype.getProtocolSupportCache = function () {
  return Promise.resolve(this.protocolSupportCache);
};

/**
* Return the private IP addresses of the computer
* @public
* @method getPrivateIps
* @return {Promise<Array<string>>} A promise that fulfills with a list of IPs,
*                                  or rejects on timeout
*/
PortControl.prototype.getPrivateIps = function () {
  return utils.getPrivateIps();
};

/**
* Deletes all the currently active port mappings
* @public
* @method close
*/
PortControl.prototype.close = function () {
  var _this = this;

  return new Promise(function (F, R) {
    // Get all the keys (extPorts) of activeMappings
    var extPorts = [];
    for (var extPort in _this.activeMappings) {
      if (_this.activeMappings.hasOwnProperty(extPort)) {
        extPorts.push(extPort);
      }
    }

    // Delete them all
    Promise.all(extPorts.map(_this.deleteMapping.bind(_this))).then(function () {
      F();
    });
  });
};

if (typeof freedom !== 'undefined') {
  freedom().providePromises(PortControl);
} else {
  module.exports = PortControl;
}
