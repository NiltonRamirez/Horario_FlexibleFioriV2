sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, Device, JSONModel) {
    "use strict";

    return UIComponent.extend("horarios.flexible.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);
            this.getRouter().initialize();
            
            // Initialize app model for storing app state
            this.setModel(new JSONModel(), "app");
            
            // Wait for FLP to be ready before continuing initialization
            this._waitForFLPThenInit();
        },

        _waitForFLPThenInit: function() {
            var that = this;
            
            // Check if we're in FLP/Work Zone
            if (sap && sap.ushell && sap.ushell.Container) {
                console.log("✅ FLP ya está disponible");
                this._initializeComponent();
            } else {
                // FLP not ready yet, wait for it
                console.log("⏳ Esperando a que FLP esté disponible...");
                
                var checkFLPInterval = setInterval(function() {
                    if (sap && sap.ushell && sap.ushell.Container) {
                        console.log("✅ FLP ahora está disponible!");
                        clearInterval(checkFLPInterval);
                        that._initializeComponent();
                    }
                }, 100);
                
                // Fallback: if FLP not ready after 5 seconds, proceed anyway
                setTimeout(function() {
                    clearInterval(checkFLPInterval);
                    console.log("⚠️ FLP no se cargó en 5 segundos, procediendo sin él...");
                    that._initializeComponent();
                }, 5000);
            }
        },

        _initializeComponent: function() {
            console.log("🚀 Componente inicializado");
        },

        getContentDensityClass: function () {
            if (!this.sContentDensityClass) {
                if (!sap.ui.Device.support.touch) {
                    this.sContentDensityClass = "sapUiSizeCompact";
                } else {
                    this.sContentDensityClass = "sapUiSizeCozy";
                }
            }
            return this.sContentDensityClass;
        }
    });
});
