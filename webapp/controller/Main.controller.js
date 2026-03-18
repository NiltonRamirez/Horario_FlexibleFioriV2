sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    var BASE_URL = "destinations/dest_int_s/http/workplan";

    return Controller.extend("horarios.flexible.controller.Main", {

        // ============================================================
        // LIFECYCLE
        // ============================================================

        onInit: function () {
            var oViewModel = new JSONModel({
                busy: false,
                employee: {
                    name: "",
                    area: "",
                    defaultLocation: "",
                    country: "",
                    userId: ""
                },
                locations: [],
                schedules: [],
                week: {
                    editable: false,
                    weekStart: "",
                    weekStatus: "",
                    days: []
                },
                currentWeekStart: this._getCurrentWeekMonday()
            });
            this.getView().setModel(oViewModel, "viewModel");
            this._loadInitialData();
        },

        // ============================================================
        // DATA LOADING
        // ============================================================

        _loadInitialData: function () {
            var oModel = this.getView().getModel("viewModel");
            var sUserId = this._getUserId();

            oModel.setProperty("/busy", true);

            Promise.all([
                this._apiFetch(BASE_URL + "/employee-context?userId=" + sUserId),
                this._apiFetch(BASE_URL + "/locations"),
                this._apiFetch(BASE_URL + "/schedules?userId=" + sUserId)
            ]).then(function (aResults) {
                oModel.setProperty("/employee", aResults[0].d);
                oModel.setProperty("/locations", aResults[1].locations || []);
                // Flatten schedules.element array
                var aSchedules = (aResults[2].schedules && aResults[2].schedules.element) || [];
                oModel.setProperty("/schedules", aSchedules);

                var sWeekStart = oModel.getProperty("/currentWeekStart");
                return this._apiFetch(BASE_URL + "/week-context?userId=" + sUserId + "&startDate=" + sWeekStart);
            }.bind(this)).then(function (oWeekData) {
                this._setWeekData(oWeekData);
                oModel.setProperty("/busy", false);
            }.bind(this)).catch(function (oError) {
                oModel.setProperty("/busy", false);
                MessageBox.error("Error al cargar los datos: " + (oError.message || String(oError)));
            });
        },

        _setWeekData: function (oWeekData) {
            var oModel = this.getView().getModel("viewModel");
            // Normalize days: add editable flag, convert nulls to empty string
            oWeekData.days = (oWeekData.days || []).map(function (oDay) {
                oDay.editable = oWeekData.editable === true;
                oDay.workMode = oDay.workMode || "";
                oDay.location = oDay.location || "";
                oDay.schedule = oDay.schedule || "";
                oDay.absenceType = oDay.absenceType || "";
                return oDay;
            });
            oModel.setProperty("/week", oWeekData);
        },

        onRefresh: function () {
            this._loadInitialData();
        },

        // ============================================================
        // WEEK NAVIGATION
        // ============================================================

        onPreviousWeek: function () {
            this._navigateWeek(-7);
        },

        onNextWeek: function () {
            this._navigateWeek(7);
        },

        _navigateWeek: function (nDays) {
            var oModel = this.getView().getModel("viewModel");
            var sCurrentStart = oModel.getProperty("/currentWeekStart");
            var oDate = new Date(sCurrentStart + "T00:00:00");
            oDate.setDate(oDate.getDate() + nDays);
            var sNewStart = this._formatDate(oDate);

            oModel.setProperty("/currentWeekStart", sNewStart);
            oModel.setProperty("/busy", true);

            var sUserId = this._getUserId();
            this._apiFetch(BASE_URL + "/week-context?userId=" + sUserId + "&startDate=" + sNewStart)
                .then(function (oWeekData) {
                    this._setWeekData(oWeekData);
                    oModel.setProperty("/busy", false);
                }.bind(this))
                .catch(function (oError) {
                    oModel.setProperty("/busy", false);
                    MessageBox.error("Error al cargar la semana: " + (oError.message || String(oError)));
                });
        },

        // ============================================================
        // USER INTERACTIONS
        // ============================================================

        onWorkModeChange: function (oEvent) {
            var oSelect = oEvent.getSource();
            var sNewMode = oSelect.getSelectedKey();
            var oContext = oSelect.getBindingContext("viewModel");
            var sPath = oContext.getPath();
            var oModel = this.getView().getModel("viewModel");

            oModel.setProperty(sPath + "/workMode", sNewMode);

            // Clear location when switching away from PRESENCIAL
            if (sNewMode !== "PRESENCIAL") {
                oModel.setProperty(sPath + "/location", "");
            }
            // Clear schedule when no mode selected
            if (!sNewMode) {
                oModel.setProperty(sPath + "/schedule", "");
            }
        },

        onClear: function () {
            var oModel = this.getView().getModel("viewModel");
            MessageBox.confirm("¿Desea limpiar la planificación de la semana?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var aDays = oModel.getProperty("/week/days") || [];
                        aDays.forEach(function (oDay, iIdx) {
                            if (!oDay.locked) {
                                oModel.setProperty("/week/days/" + iIdx + "/workMode", "");
                                oModel.setProperty("/week/days/" + iIdx + "/location", "");
                                oModel.setProperty("/week/days/" + iIdx + "/schedule", "");
                            }
                        });
                    }
                }
            });
        },

        onSave: function () {
            var oModel = this.getView().getModel("viewModel");
            var oWeek = oModel.getProperty("/week");
            var sUserId = this._getUserId();

            // Validate
            var sValidationError = this._validate(oWeek.days);
            if (sValidationError) {
                MessageBox.warning(sValidationError);
                return;
            }

            // Build payload
            var oPayload = {
                userId: sUserId,
                weekStart: oWeek.weekStart,
                entries: oWeek.days.map(function (oDay) {
                    var sMode = oDay.workMode || "";
                    return {
                        date: oDay.date,
                        workMode: sMode,
                        location: sMode === "PRESENCIAL" ? (oDay.location || "") : "",
                        schedule: (sMode === "PRESENCIAL" || sMode === "TELETRABAJO") ? (oDay.schedule || "") : ""
                    };
                })
            };

            oModel.setProperty("/busy", true);

            // Fetch CSRF token then POST
            fetch(BASE_URL + "/employee-context?userId=" + sUserId, {
                method: "GET",
                headers: { "X-CSRF-Token": "Fetch" }
            }).then(function (oResponse) {
                var sCsrfToken = oResponse.headers.get("X-CSRF-Token") || "";
                return fetch(BASE_URL + "/save", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": sCsrfToken
                    },
                    body: JSON.stringify(oPayload)
                });
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sBody) {
                        throw new Error("HTTP " + oResponse.status + ": " + sBody);
                    });
                }
                return oResponse.json().catch(function () { return {}; });
            }).then(function () {
                MessageToast.show("Planificación guardada exitosamente");
                // Reload week to reflect saved status
                return this._apiFetch(BASE_URL + "/week-context?userId=" + sUserId + "&startDate=" + oWeek.weekStart);
            }.bind(this)).then(function (oWeekData) {
                this._setWeekData(oWeekData);
                oModel.setProperty("/busy", false);
            }.bind(this)).catch(function (oError) {
                oModel.setProperty("/busy", false);
                MessageBox.error("Error al guardar la planificación: " + (oError.message || String(oError)));
            }.bind(this));
        },

        // ============================================================
        // VALIDATION
        // ============================================================

        _validate: function (aDays) {
            for (var i = 0; i < aDays.length; i++) {
                var oDay = aDays[i];
                if (oDay.locked) continue;
                if (!oDay.workMode) {
                    return "Seleccione el modo de trabajo para el día " + oDay.day + ".";
                }
                if (oDay.workMode === "PRESENCIAL" && !oDay.location) {
                    return "Seleccione una sede para el día " + oDay.day + " (Presencial).";
                }
                if ((oDay.workMode === "PRESENCIAL" || oDay.workMode === "TELETRABAJO") && !oDay.schedule) {
                    return "Seleccione un horario para el día " + oDay.day + ".";
                }
            }
            return null;
        },

        // ============================================================
        // HTTP HELPERS
        // ============================================================

        _apiFetch: function (sUrl) {
            return fetch(sUrl, {
                method: "GET",
                headers: { "Accept": "application/json" }
            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status + " - " + oResponse.statusText + " [" + sUrl + "]");
                }
                return oResponse.json();
            });
        },

        // ============================================================
        // UTILITIES
        // ============================================================

        _getUserId: function () {
            // Temporary fallback until user mapping from Launchpad is finalized.
            return "10000";
        },

        _getCurrentWeekMonday: function () {
            var today = new Date();
            var day = today.getDay(); // 0=Sun, 1=Mon, ...
            if (day === 5) {
                var nextMonday = new Date(today);
                nextMonday.setDate(today.getDate() + 3);
                return this._formatDate(nextMonday);
            }
            var diff = day === 0 ? -6 : 1 - day;
            var monday = new Date(today);
            monday.setDate(today.getDate() + diff);
            return this._formatDate(monday);
        },

        _formatDate: function (oDate) {
            var y = oDate.getFullYear();
            var m = String(oDate.getMonth() + 1).padStart(2, "0");
            var d = String(oDate.getDate()).padStart(2, "0");
            return y + "-" + m + "-" + d;
        },

        // ============================================================
        // FORMATTERS
        // ============================================================

        formatWeekRange: function (sWeekStart) {
            if (!sWeekStart) return "Semana";
            var oStart = new Date(sWeekStart + "T00:00:00");
            var oEnd = new Date(sWeekStart + "T00:00:00");
            oEnd.setDate(oEnd.getDate() + 4);
            var aMonths = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            return "Semana del " + oStart.getDate() + " " + aMonths[oStart.getMonth()] +
                " al " + oEnd.getDate() + " " + aMonths[oEnd.getMonth()] + " " + oEnd.getFullYear();
        },

        formatWeekStatusText: function (sStatus) {
            var mText = { "SAVED": "Guardado", "EMPTY": "Sin planificar", "SUBMITTED": "Enviado", "APPROVED": "Aprobado" };
            return mText[sStatus] || sStatus || "";
        },

        formatWeekStatusState: function (sStatus) {
            var mStates = { "SAVED": "Success", "EMPTY": "None", "SUBMITTED": "Warning", "APPROVED": "Success" };
            return mStates[sStatus] || "None";
        },

        formatDateDisplay: function (sDate) {
            if (!sDate) return "";
            var aParts = sDate.split("-");
            if (aParts.length < 3) return sDate;
            var aMonths = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            return aParts[2] + " " + aMonths[parseInt(aParts[1], 10) - 1] + " " + aParts[0];
        },

        formatRowHighlight: function (bLocked) {
            return bLocked ? "Warning" : "None";
        },

        formatBool: function (bVal) {
            return bVal === true;
        },

        formatNotBool: function (bVal) {
            return bVal !== true;
        },

        formatNotLocked: function (bLocked) {
            return !bLocked;
        },

        // Show editable Select when not locked AND week is editable
        formatShowEditSelect: function (bLocked, bEditable) {
            return !bLocked && bEditable === true;
        },

        // Show read-only ObjectStatus for unlocked days in non-editable week that have a workMode
        formatShowReadOnlyMode: function (bLocked, bEditable, sWorkMode) {
            return !bLocked && bEditable !== true && !!sWorkMode;
        },

        // Show location Select: PRESENCIAL + not locked + editable
        formatShowLocationSelect: function (sWorkMode, bLocked, bEditable) {
            return sWorkMode === "PRESENCIAL" && !bLocked && bEditable === true;
        },

        // Show location read-only text: PRESENCIAL + not locked + not editable
        formatShowLocationReadOnly: function (sWorkMode, bLocked, bEditable) {
            return sWorkMode === "PRESENCIAL" && !bLocked && bEditable !== true;
        },

        // Show schedule Select: PRESENCIAL or TELETRABAJO + not locked + editable
        formatShowScheduleSelect: function (sWorkMode, bLocked, bEditable) {
            return (sWorkMode === "PRESENCIAL" || sWorkMode === "TELETRABAJO") && !bLocked && bEditable === true;
        },

        // Show schedule read-only text: PRESENCIAL or TELETRABAJO + not locked + not editable
        formatShowScheduleReadOnly: function (sWorkMode, bLocked, bEditable) {
            return (sWorkMode === "PRESENCIAL" || sWorkMode === "TELETRABAJO") && !bLocked && bEditable !== true;
        },

        formatWorkModeText: function (sWorkMode) {
            var mText = { "PRESENCIAL": "Presencial", "TELETRABAJO": "Teletrabajo", "FESTIVO": "Festivo", "AUSENCIA": "Ausencia" };
            return mText[sWorkMode] || sWorkMode || "-";
        },

        formatWorkModeState: function (sWorkMode) {
            var mStates = { "PRESENCIAL": "Success", "TELETRABAJO": "Information", "FESTIVO": "Warning", "AUSENCIA": "Error" };
            return mStates[sWorkMode] || "None";
        },

        formatWorkModeIcon: function (sWorkMode) {
            var mIcons = {
                "PRESENCIAL": "sap-icon://building",
                "TELETRABAJO": "sap-icon://home",
                "FESTIVO": "sap-icon://calendar",
                "AUSENCIA": "sap-icon://away"
            };
            return mIcons[sWorkMode] || "";
        },

        formatLockedStatusText: function (sWorkMode, sAbsenceType) {
            if (sAbsenceType) return sAbsenceType;
            if (sWorkMode === "FESTIVO") return "Día Festivo";
            if (sWorkMode === "AUSENCIA") return "Ausencia";
            return sWorkMode || "";
        },

        formatLockedState: function (sWorkMode) {
            if (sWorkMode === "FESTIVO") return "Warning";
            if (sWorkMode === "AUSENCIA") return "Error";
            return "None";
        },

        // Lookup location name from code
        formatLocationName: function (sCode, aLocations) {
            if (!sCode || !aLocations) return "";
            var oLoc = aLocations.find(function (l) { return l.code === sCode; });
            return oLoc ? oLoc.name : sCode;
        },

        // Lookup schedule name from code
        formatScheduleName: function (sCode, aSchedules) {
            if (!sCode || !aSchedules) return "";
            var oSched = aSchedules.find(function (s) { return s.code === sCode; });
            return oSched ? oSched.name : sCode;
        }

    });
});
