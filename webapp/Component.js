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

            // errorMsg: mensaje visible en la UI cuando el usuario no puede resolverse
            this.setModel(new JSONModel({
                userId:    "",
                userEmail: "",
                errorMsg:  ""
            }), "app");

            this._resolveUser();
        },

        getWorkplanService: function () {
            return this._oWorkplanService;
        },

        // ----------------------------------------------------------------
        // Flujo principal de resolución de usuario
        //
        //  En Work Zone (FLP disponible):
        //    1. Obtiene email del servicio UserInfo de ushell
        //    2. Llama a /http/api/v1/users/by-email para obtener el employeeId
        //    3. Casos de error → muestra mensaje en la UI
        //
        //  En BAS local (sin FLP):
        //    → usa testUserId desde URL ?testUserId=XXXX o localStorage
        //       o el valor por defecto "10000"
        // ----------------------------------------------------------------
        _resolveUser: function () {
            var that = this;
            var oAppModel = this.getModel("app");

            if (sap && sap.ushell && sap.ushell.Container) {
                // ---------- Contexto Work Zone / FLP ----------
                sap.ushell.Container.getServiceAsync("UserInfo")
                    .then(function (oService) {
                        var sEmail = "";
                        try { sEmail = oService.getEmail(); } catch (e) { /* noop */ }

                        if (!sEmail) {
                            return Promise.reject({ code: "NO_EMAIL",
                                message: "No se pudo obtener el email del usuario desde el sistema." });
                        }

                        console.log("📧 Component | Email FLP:", sEmail);
                        oAppModel.setProperty("/userEmail", sEmail);
                        return that._oWorkplanService.getUserByEmail(sEmail);
                    })
                    .then(function (oResponse) {
                        // HTTP 200 pero puede venir con status "error" (ej. MULTIPLE_USERS)
                        if (oResponse && oResponse.status === "success" && oResponse.data) {
                            var sId = oResponse.data.employeeId;
                            console.log("✅ Component | employeeId resuelto:", sId);
                            oAppModel.setProperty("/userId", sId);
                            oAppModel.setProperty("/userEmail", oResponse.data.email || oAppModel.getProperty("/userEmail"));
                        } else if (oResponse && oResponse.status === "error") {
                            var oErr = oResponse.error || {};
                            var sMsg = oErr.code === "MULTIPLE_USERS"
                                ? "Se encontraron múltiples usuarios con el mismo email. Contacte a soporte técnico."
                                : (oErr.message || "Error al resolver el usuario.");
                            console.error("❌ Component | Error API by-email:", oErr);
                            oAppModel.setProperty("/errorMsg", sMsg);
                        }
                    })
                    .catch(function (oError) {
                        // HTTP 401 → usuario no en base de colaboradores activos
                        var sMsg;
                        if (oError && oError.status === 401) {
                            sMsg = "Su usuario no está autorizado para acceder a la planificación semanal.";
                        } else if (oError && oError.code === "NO_EMAIL") {
                            sMsg = oError.message;
                        } else {
                            sMsg = "No se pudo resolver el usuario. Por favor recargue la página.";
                        }
                        console.error("❌ Component | Error resolviendo usuario:", oError);
                        oAppModel.setProperty("/errorMsg", sMsg);
                    });

            } else {
                // ---------- BAS local / sin FLP → fallback dev ----------
                var sTestId = this._getTestUserId();
                console.warn("⚠️ Component | FLP no disponible. Usando testUserId:", sTestId);
                oAppModel.setProperty("/userId",    sTestId);
                oAppModel.setProperty("/userEmail", "dev@test.local");

                // Espera a que FLP cargue (algunos entornos tardan)
                var that2 = this;
                var nCheck = setInterval(function () {
                    if (sap && sap.ushell && sap.ushell.Container) {
                        clearInterval(nCheck);
                        // Si el userId de prueba sigue activo, relanza la resolución real
                        if (that2.getModel("app").getProperty("/userEmail") === "dev@test.local") {
                            that2._resolveUser();
                        }
                    }
                }, 500);

                // Máximo 8 s de espera
                setTimeout(function () { clearInterval(nCheck); }, 8000);
            }
        },

        _getTestUserId: function () {
            var oParams   = new URLSearchParams(window.location.search || "");
            var sFromUrl  = oParams.get("testUserId");
            var sFromStorage = window.localStorage.getItem("workplan.testUserId");
            return sFromUrl || sFromStorage || "10000";
        }
    });
});
