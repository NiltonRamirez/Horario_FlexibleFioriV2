sap.ui.getCore().attachInit(function () {
    sap.ui.require(["sap/ui/core/ComponentContainer"], function (ComponentContainer) {
        new ComponentContainer({
            id: "container",
            name: "horarios.flexible",
            manifest: true,
            height: "100%"
        }).placeAt("ui5-content");
    });
});
