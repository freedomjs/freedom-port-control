window.onload = function (port) {
  if (typeof freedom !== 'undefined') {
    freedom('port-control.json').then(function () {
      console.log("loaded?");
    });
  }
}.bind({}, self.port);