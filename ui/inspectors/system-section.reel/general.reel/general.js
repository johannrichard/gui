/**
 * @module ui/general.reel
 */
var Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    Model = require("core/model/model").Model;

/**
 * @class General
 * @extends Component
 */
exports.General = Component.specialize(/** @lends General# */ {
    systemGeneral: {
        value: null
    },

    enterDocument: {
        value: function(isFirstTime) {
            if (isFirstTime) {
                var self = this,
                    loadingPromises = [];
                this.isLoading = true;
                loadingPromises.push(
                    this.application.dataService.fetchData(Model.SystemGeneral).then(function(systemGeneral) {
                        self.hostname = systemGeneral[0].hostname;
                    }),
                    this.application.systemInfoService.getVersion().then(function(version) {
                        self.version = version;
                    }),
                    this.application.systemInfoService.getHardware().then(function(hardware) {
                        self.hardware = hardware;
                    }),
                    this.application.systemInfoService.getTime().then(function(time) {
                        self.time = time;
                    }),
                    this.application.systemInfoService.getLoad().then(function(load) {
                        self.load = load;
                    })
                );
                Promise.all(loadingPromises).then(function() {
                    self.isLoading = false;
                });
            }

        }
    }
});
