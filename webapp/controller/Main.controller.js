sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("horarios.flexible.controller.Main", {

        // ============================================================
        // LIFECYCLE
        // ============================================================

        onInit: function () {
            var oViewModel = new JSONModel({
                busy: false,
                employee: { name: "", area: "", defaultLocation: "", country: "", userId: "" },
                locations: [],
                schedules: [],
                week: { editable: false, weekStart: "", weekStatus: "", days: [] },
                currentWeekStart: this._getCurrentWeekMonday()
            });
            this.getView().setModel(oViewModel, "viewModel");

            if (this.getOwnerComponent().getModel("app").getProperty("/userId")) {
                this._loadInitialData();
            } else {
                sap.ui.core.EventBus.getInstance().subscribe(
                    "HorariosApp", "UserResolved", this._onUserResolved, this
                );
            }
        },

        onExit: function () {
            sap.ui.core.EventBus.getInstance().unsubscribe(
                "HorariosApp", "UserResolved", this._onUserResolved, this
            );
        },

        _onUserResolved: function () {
            sap.ui.core.EventBus.getInstance().unsubscribe(
                "HorariosApp", "UserResolved", this._onUserResolved, this
            );
            this._loadInitialData();
        },

        // ============================================================
        // DATA LOADING
        // ============================================================

        _getService: function () {
            return this.getOwnerComponent().getWorkplanService();
        },

        _getUserId: function () {
            return this.getOwnerComponent().getModel("app").getProperty("/userId") || "";
        },

        _loadInitialData: function () {
            var oModel   = this.getView().getModel("viewModel");
            var oService = this._getService();
            var sUserId  = this._getUserId();

            oModel.setProperty("/busy", true);

            Promise.all([
                oService.getEmployeeContext(sUserId),
                oService.getLocations(),
                oService.getSchedules(sUserId)
            ]).then(function (aResults) {
                oModel.setProperty("/employee", aResults[0].d);

                var aLocations = aResults[1].locations || [];
                aLocations.unshift({ code: "", name: "-- Seleccionar --" });
                oModel.setProperty("/locations", aLocations);

                var aSchedules = (aResults[2].schedules && aResults[2].schedules.element) || [];
                aSchedules.unshift({ code: "", name: "-- Seleccionar --" });
                oModel.setProperty("/schedules", aSchedules);

                var sWeekStart = oModel.getProperty("/currentWeekStart");
                return oService.getWeekContext(sUserId, sWeekStart);
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
            // SAVED weeks are read-only — user cannot modify or clear
            if (oWeekData.weekStatus === "SAVED") {
                oWeekData.editable = false;
            }
            oWeekData.days = (oWeekData.days || []).map(function (oDay) {
                oDay.editable    = oWeekData.editable === true;
                oDay.locked      = oDay.locked || oDay.isHoliday || oDay.isAbsent || false;
                oDay.workMode    = oDay.workMode    || "";
                oDay.location    = oDay.location    || "";
                oDay.schedule    = oDay.schedule    || "";
                oDay.absenceType = oDay.absenceType || "";
                return oDay;
            });
            oModel.setProperty("/week", oWeekData);
        },

        onRefresh: function () {
            this._loadInitialData();
        },


        // ============================================================
        // USER INTERACTIONS
        // ============================================================

        onWorkModeChange: function (oEvent) {
            var oSelect  = oEvent.getSource();
            var sNewMode = oSelect.getSelectedKey();
            var sPath    = oSelect.getBindingContext("viewModel").getPath();
            var oModel   = this.getView().getModel("viewModel");

            oModel.setProperty(sPath + "/workMode", sNewMode);
            if (sNewMode !== "PRESENCIAL") { oModel.setProperty(sPath + "/location", ""); }
            if (!sNewMode)                 { oModel.setProperty(sPath + "/schedule", ""); }
        },

        onClear: function () {
            var oModel = this.getView().getModel("viewModel");
            MessageBox.confirm("¿Desea limpiar la planificación de la semana?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        (oModel.getProperty("/week/days") || []).forEach(function (oDay, iIdx) {
                            if (!oDay.locked) {
                                oModel.setProperty("/week/days/" + iIdx + "/workMode",  "");
                                oModel.setProperty("/week/days/" + iIdx + "/location",  "");
                                oModel.setProperty("/week/days/" + iIdx + "/schedule",  "");
                            }
                        });
                    }
                }
            });
        },

        onSave: function () {
            var oModel   = this.getView().getModel("viewModel");
            var oWeek    = oModel.getProperty("/week");
            var sUserId  = this._getUserId();
            var oService = this._getService();

            var sError = this._validate(oWeek.days);
            if (sError) { MessageBox.warning(sError); return; }

            var oPayload = {
                userId:    sUserId,
                weekStart: oWeek.weekStart,
                entries: oWeek.days.map(function (oDay) {
                    var sMode = oDay.workMode || "";
                    return {
                        date:     oDay.date,
                        workMode: sMode,
                        location: sMode === "PRESENCIAL" ? (oDay.location || "") : "",
                        schedule: (sMode === "PRESENCIAL" || sMode === "TELETRABAJO") ? (oDay.schedule || "") : ""
                    };
                })
            };

            oModel.setProperty("/busy", true);

            oService.saveWeek(oPayload)
                .then(function () {
                    MessageToast.show("Planificación guardada exitosamente");
                    return oService.getWeekContext(sUserId, oWeek.weekStart);
                }.bind(this))
                .then(function (oWeekData) {
                    this._setWeekData(oWeekData);
                    oModel.setProperty("/busy", false);
                }.bind(this))
                .catch(function (oError) {
                    oModel.setProperty("/busy", false);
                    MessageBox.error("Error al guardar: " + (oError.message || String(oError)));
                });
        },

        // ============================================================
        // VALIDATION
        // ============================================================

        _validate: function (aDays) {
            for (var i = 0; i < aDays.length; i++) {
                var oDay = aDays[i];
                if (oDay.locked) { continue; }
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
        // UTILITIES
        // ============================================================

        _getCurrentWeekMonday: function () {
            var today = new Date();
            var day   = today.getDay();
            if (day === 5) {
                var nextMonday = new Date(today);
                nextMonday.setDate(today.getDate() + 3);
                return this._formatDate(nextMonday);
            }
            var diff   = day === 0 ? -6 : 1 - day;
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
            if (!sWeekStart) { return "Semana"; }
            var oStart  = new Date(sWeekStart + "T00:00:00");
            var oEnd    = new Date(sWeekStart + "T00:00:00");
            oEnd.setDate(oEnd.getDate() + 4);
            var aM = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
            return "Semana del " + oStart.getDate() + " " + aM[oStart.getMonth()] +
                   " al " + oEnd.getDate() + " " + aM[oEnd.getMonth()] + " " + oEnd.getFullYear();
        },

        formatWeekStatusText: function (sStatus) {
            return { "SAVED": "Guardado", "EMPTY": "Sin planificar", "SUBMITTED": "Enviado", "APPROVED": "Aprobado" }[sStatus] || sStatus || "";
        },

        formatWeekStatusState: function (sStatus) {
            return { "SAVED": "Success", "EMPTY": "None", "SUBMITTED": "Warning", "APPROVED": "Success" }[sStatus] || "None";
        },

        formatDateDisplay: function (sDate) {
            if (!sDate) { return ""; }
            var p = sDate.split("-");
            if (p.length < 3) { return sDate; }
            var aM = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
            return p[2] + " " + aM[parseInt(p[1], 10) - 1] + " " + p[0];
        },

        formatRowHighlight:        function (b)           { return b ? "Warning" : "None"; },
        formatBool:                function (b)           { return b === true; },
        formatNotBool:             function (b)           { return b !== true; },
        formatNotLocked:           function (b)           { return !b; },
        formatShowEditSelect:      function (bL, bE)      { return !bL && bE === true; },
        formatShowReadOnlyMode:    function (bL, bE, sWM) { return !bL && bE !== true && !!sWM; },
        formatShowLocationSelect:  function (sWM, bL, bE) { return sWM === "PRESENCIAL" && !bL && bE === true; },
        formatShowLocationReadOnly:function (sWM, bL, bE) { return sWM === "PRESENCIAL" && !bL && bE !== true; },
        formatShowScheduleSelect:  function (sWM, bL, bE) { return (sWM === "PRESENCIAL" || sWM === "TELETRABAJO") && !bL && bE === true; },
        formatShowScheduleReadOnly:function (sWM, bL, bE) { return (sWM === "PRESENCIAL" || sWM === "TELETRABAJO") && !bL && bE !== true; },

        formatWorkModeText: function (sWM) {
            return { "PRESENCIAL":"Presencial","TELETRABAJO":"Teletrabajo","FESTIVO":"Festivo","AUSENCIA":"Ausencia" }[sWM] || sWM || "-";
        },
        formatWorkModeState: function (sWM) {
            return { "PRESENCIAL":"Success","TELETRABAJO":"Information","FESTIVO":"Warning","AUSENCIA":"Error" }[sWM] || "None";
        },
        formatWorkModeIcon: function (sWM) {
            return { "PRESENCIAL":"sap-icon://building","TELETRABAJO":"sap-icon://home","FESTIVO":"sap-icon://calendar","AUSENCIA":"sap-icon://away" }[sWM] || "";
        },
        formatLockedStatusText: function (sWM, sAbsType) {
            if (sAbsType) { return sAbsType; }
            return { "FESTIVO":"Día Festivo","AUSENCIA":"Ausencia" }[sWM] || sWM || "";
        },
        formatLockedState: function (sWM) {
            return { "FESTIVO":"Warning","AUSENCIA":"Error" }[sWM] || "None";
        },
        formatLocationName: function (sCode, aLocs) {
            if (!sCode || !aLocs) { return ""; }
            var o = aLocs.find(function (l) { return l.code === sCode; });
            return o ? o.name : sCode;
        },
        formatScheduleName: function (sCode, aScheds) {
            if (!sCode || !aScheds) { return ""; }
            var o = aScheds.find(function (s) { return s.code === sCode; });
            return o ? o.name : sCode;
        }
    });
});
