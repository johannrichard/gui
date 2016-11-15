var AbstractInspector = require("ui/abstract/abstract-inspector").AbstractInspector,
    Model = require("core/model/model").Model;


exports.Tunables = AbstractInspector.specialize({

    _inspectorTemplateDidLoad: {
        value: function (){
            var self = this;
            return this.application.dataService.fetchData(Model.Tunable).then(function (tunables) {
                self.tunables = tunables;
            });
        }
    },

    enterDocument: {
        value: function(isFirsttime) {
            this.super();
            if (isFirsttime) {
                this.addPathChangeListener("viewer.selectedObject", this, "_handleSelectedEntryChange");
            }
        }
    },

    exitDocument: {
        value: function() {
            this.viewer.selectedObject = null;
        }
    },

    _handleSelectedEntryChange: {
        value: function(value) {
            this.selectedObject = value;
        }
    }
});