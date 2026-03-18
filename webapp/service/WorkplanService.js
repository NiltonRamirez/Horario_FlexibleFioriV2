sap.ui.define([
    "sap/ui/base/Object"
], function (BaseObject) {
    "use strict";

    return BaseObject.extend("horarios.flexible.service.WorkplanService", {

        constructor: function () {
            this._sBaseUrl = "/destinations/dest_int_s";
            this._sCsrfToken = null;
            this._oUserInfo = null;
        },

        // ============================================================
        // USER INFO  (mismo patrón que QuotaService)
        // ============================================================

        getUserInfo: function () {
            if (this._oUserInfo) {
                return Promise.resolve(this._oUserInfo);
            }
            return this._getUserFromFLP()
                .then(function (oUserFromFLP) {
                    if (oUserFromFLP) {
                        this._oUserInfo = oUserFromFLP;
                        return this._oUserInfo;
                    }
                    var oUserFromToken = this._getUserFromToken();
                    if (oUserFromToken) {
                        this._oUserInfo = oUserFromToken;
                        return this._oUserInfo;
                    }
                    throw new Error("No se encontró usuario autenticado");
                }.bind(this));
        },

        _getUserFromFLP: function () {
            if (sap && sap.ushell && sap.ushell.Container) {
                return sap.ushell.Container.getServiceAsync("UserInfo")
                    .then(function (oService) {
                        if (!oService) { return null; }
                        var sUserId, sEmail, sFullName, sFirstName, sLastName;
                        try { sUserId   = oService.getId();        } catch (e) { /* noop */ }
                        try { sEmail    = oService.getEmail();     } catch (e) { /* noop */ }
                        try { sFullName = oService.getFullName();  } catch (e) { /* noop */ }
                        try { sFirstName= oService.getFirstName(); } catch (e) { /* noop */ }
                        try { sLastName = oService.getLastName();  } catch (e) { /* noop */ }

                        if (!sUserId && !sEmail) { return null; }

                        return {
                            id:        sUserId || sEmail || "",
                            email:     sEmail  || "",
                            fullName:  sFullName || "",
                            firstName: sFirstName || "",
                            lastName:  sLastName  || ""
                        };
                    })
                    .catch(function () { return null; });
            }
            return Promise.resolve(null);
        },

        _getUserFromToken: function () {
            var aLocations = [
                { storage: sessionStorage, name: "sessionStorage" },
                { storage: localStorage,   name: "localStorage"   }
            ];
            for (var i = 0; i < aLocations.length; i++) {
                for (var key in aLocations[i].storage) {
                    try {
                        var sValue = aLocations[i].storage.getItem(key);
                        if (sValue && sValue.startsWith("ey") && sValue.split(".").length === 3) {
                            var oPayload = JSON.parse(atob(sValue.split(".")[1]));
                            return {
                                id:        oPayload.email || oPayload.user_name || oPayload.sub || "",
                                email:     oPayload.email || oPayload.mail || "",
                                fullName:  oPayload.name  || "",
                                firstName: oPayload.given_name  || "",
                                lastName:  oPayload.family_name || ""
                            };
                        }
                    } catch (e) { /* skip invalid entries */ }
                }
            }
            return null;
        },

        // ============================================================
        // WORKPLAN ENDPOINTS
        // ============================================================

        getEmployeeContext: function (sUserId) {
            return this._callService("/http/workplan/employee-context?userId=" + sUserId, "GET", null);
        },

        getLocations: function () {
            return this._callService("/http/workplan/locations", "GET", null);
        },

        getSchedules: function (sUserId) {
            return this._callService("/http/workplan/schedules?userId=" + sUserId, "GET", null);
        },

        getWeekContext: function (sUserId, sStartDate) {
            return this._callService(
                "/http/workplan/week-context?userId=" + sUserId + "&startDate=" + sStartDate,
                "GET", null
            );
        },

        saveWeek: function (oPayload) {
            return this._callService("/http/workplan/save", "POST", oPayload);
        },

        // ============================================================
        // CSRF TOKEN
        // ============================================================

        _fetchCsrfToken: function () {
            if (this._sCsrfToken) {
                return Promise.resolve(this._sCsrfToken);
            }
            var sUrl = this._sBaseUrl + "/http/workplan/locations";
            return fetch(sUrl, {
                method: "GET",
                headers: { "X-CSRF-Token": "Fetch" }
            }).then(function (oResponse) {
                var sToken = oResponse.headers.get("X-CSRF-Token");
                if (sToken) { this._sCsrfToken = sToken; }
                return sToken || null;
            }.bind(this))
            .catch(function () { return null; });
        },

        // ============================================================
        // INTERNAL HTTP
        // ============================================================

        _callService: function (sEndpoint, sMethod, oData) {
            var sUrl = this._sBaseUrl + sEndpoint;
            console.log("🌐 WorkplanService | " + sMethod + " " + sUrl, oData || "");

            if (sMethod === "POST" || sMethod === "PUT" || sMethod === "DELETE") {
                return this._fetchCsrfToken().then(function (sToken) {
                    var oHeaders = { "Content-Type": "application/json" };
                    if (sToken) { oHeaders["X-CSRF-Token"] = sToken; }
                    return fetch(sUrl, {
                        method: sMethod,
                        headers: oHeaders,
                        body: JSON.stringify(oData)
                    }).then(function (oResponse) {
                        console.log("📥 WorkplanService | " + sMethod + " " + sUrl + " → " + oResponse.status);
                        if (oResponse.status === 403) { this._sCsrfToken = null; }
                        return this._handleResponse(oResponse);
                    }.bind(this));
                }.bind(this));
            }

            return fetch(sUrl, {
                method: sMethod,
                headers: { "Accept": "application/json" }
            }).then(function (oResponse) {
                console.log("📥 WorkplanService | " + sMethod + " " + sUrl + " → " + oResponse.status);
                return this._handleResponse(oResponse);
            }.bind(this));
        },

        _handleResponse: function (oResponse) {
            return oResponse.text().then(function (sText) {
                var oData;
                try {
                    oData = JSON.parse(sText);
                } catch (e) {
                    console.error("❌ WorkplanService | Error parseando JSON:", sText.substring(0, 200));
                    return Promise.reject({ status: oResponse.status, message: "Error al parsear respuesta JSON" });
                }
                if (!oResponse.ok) {
                    console.error("❌ WorkplanService | HTTP " + oResponse.status, oData);
                    return Promise.reject({
                        status: oResponse.status,
                        message: (oData && oData.message) || "Error en la solicitud"
                    });
                }
                console.log("✅ WorkplanService | Respuesta OK:", oData);
                return oData;
            });
        }
    });
});
