# freedom.js Port Control

Opens ports through a NAT with NAT-PMP, PCP, and UPnP.

## Build

```
npm install
grunt build
```

This will build the module file at `build/port-control.js` and a demo Chrome app in `build/demo_chrome_app/`.

## Usage

This module will allow you to control port mappings in a NAT and probe it for various settings.

### Probing methods

To run all the NAT probing tests,

```
portControl.probeProtocolSupport();
```

This method resolves to an object of the form `{"natPmp": true, "pcp": false, "upnp": true}`.

You can also probe for a specific protocol:

```
portControl.probePmpSupport();
portControl.probePcpSupport();
portControl.probeUpnpSupport();
```
All of these methods return a promise that will resolve to a boolean value.

### Add a port mapping

To add a NAT port mapping with any protocol available,

```
// Map internal port 50000 to external port 50000 with a 2 hr lifetime
portControl.addMapping(50000, 50000, 7200);
```
Passing in a lifetime of `0` seconds will keep the port mapping open indefinitely. If the actual lifetime of the mapping is less than the requested lifetime, the module will automatically handle refreshing the mapping to meet the requested lifetime.

This method returns a promise that will resolve to a `Mapping` object of the form,
```
{
  "internalIp": "192.168.1.50", 
  "internalPort": 50000, 
  "externalIp": "104.132.34.50", 
  "externalPort": 50000,
  "lifetime": 120,
  "protocol": "natPmp",
  ...
}
```

You can also create a port mapping with a specific protocol:

```
portControl.addMappingPmp(55555, 55555, 7200);
portControl.addMappingPcp(55556, 55556, 7200);
portControl.addMappingUpnp(55557, 55557, 7200);
```

All of these methods return the same promise as `addMapping` and refreshes similarly.

### Delete port mapping

To delete a NAT port mapping,

```
portControl.deleteMapping(55555);  // 55555 is the external port of the mapping
```

This will delete the module's record of this mapping and also attempt to delete it from the NAT's routing tables. The method will resolve to a boolean, which is `true` if it succeeded and `false` otherwise.

There are also methods for specific protocols,

```
portControl.deleteMappingPmp(55555);
portControl.deleteMappingPcp(55556);
portControl.deleteMappingUpnp(55557);
```

### Get active port mappings

To get the module's local record of the active port mappings,

```
portControl.getActiveMappings();
```

This method will return a promise that resolves to an object containing `Mapping` objects, where the keys are the external ports of each mapping. `Mapping` objects are removed from this list when they expire or when they are explicitly deleted.

### IP address

The module can also determine the user's private IP addresses (more than one if there are multiple active network interfaces),

```
portControl.getPrivateIps();
```

This returns a promise that will resolve to an array of IP address strings, or reject with an error.
