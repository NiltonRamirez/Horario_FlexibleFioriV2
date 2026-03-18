sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel",
    "horarios/flexible/service/WorkplanService"
], function (UIComponent, Device, JSONModel, WorkplanService) {
    "use strict";

    return UIComponent.extend("horarios.flexible.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            this._oWorkplanService = new WorkplanService();
            this.setModel(new JSONModel({ userId: "", userName: "" }), "app");

            this._waitForFLPThenGetUserInfo();
        },

        getWorkplanService: function () {
            return this._oWorkplanService;
        },

        _waitForFLPThenGetUserInfo: function () {
            var that = this;
            if (sap && sap.ushell && sap.ushell.Container) {
                this._getUserInfo();
            } else {
                var checkInterval = setInterval(function () {
                    if (sap && sap.ushell && sap.ushell.Container) {
                        clearInterval(checkInterval);
                        that._getUserInfo();
                    }
                }, 100);

                // Fallback: si FLP no responde en 5 s, usar userId de prueba
                setTimeout(function () {
                    clearInterval(checkInterval);
                    if (!that.getModel("app").getProperty("/userId")) {
                        that._getUserInfo();
                    }
                }, 5000);
            }
        },

        _getUserInfo: function () {
            var that = this;
            var oAppModel = this.getModel("app");

            this._oWorkplanService.getUserInfo()
                .then(function (oUserInfo) {
                    oAppModel.setProperty("/userId",   oUserInfo.id);
                    oAppModel.setProperty("/userName", oUserInfo.fullName || oUserInfo.id);
                })
                .catch(function () {
                    var sTestUserId = that._getTestUserId();
                    oAppModel.setProperty("/userId",   sTestUserId);
                    oAppModel.setProperty("/userName", "Usuario Demo");
                });
        },

        _getTestUserId: function () {
            var oParams  = new URLSearchParams(window.location.search || "");
            var sFromUrl = oParams.get("testUserId");
            var sFromStorage = window.localStorage.getItem("workplan.testUserId");
            return sFromUrl || sFromStorage || "10000";
        }
    });
});
