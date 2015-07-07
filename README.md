# freedom.js Port Control

Opens ports through a NAT with NAT-PMP, PCP, and UPnP.

## Build

```
npm install
grunt build
```

This will also build a demo Chrome app in `/build/demo_chrome_app`.

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
portControl.addMapping(50000, 50000);
```

This method returns a promise that will resolve to a port mapping object of the form,
```
{
  "internalIp": "192.168.1.50", 
  "internalPort": 50000, 
  "externalIp": "104.132.34.50", 
  "externalPort": 50000
}
```

It also automatically refreshes the mapping every two minutes, unless `false` is passed in as the last argument.

You can also add a port mapping with a specific protocol:

```
portControl.addMappingPmp(55555, 55555);
portControl.addMappingPcp(55556, 55556);
portControl.addMappingUpnp(55557, 55557);
```

All of these methods return the same promise as `addMapping`, and refreshes by default.

### Delete port mapping

To delete a NAT port mapping, use,

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



### IP address

The module can also determine the user's private IP addresses (more than one if there are multiple active network interfaces),

```
portControl.getPrivateIps();
```

This returns a promise that will resolve to an array of IP address strings, or reject with an error.
