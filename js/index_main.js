document.addEventListener("DOMContentLoaded", async function () {
    const fullUrl = window.location.href;
    document.getElementById("appInfo").textContent = `${appName} ${appVersion}`;
    toolURL = fullUrl.split("?")[0];
    await checkLogin();
    loadingScreen = document.getElementById("loadingScreen");
    statusUpdateLoading = document.getElementById("statusUpdateLoading");
    const logoutButton = document.getElementById("logoutBtn");

    // Add an event listener for the button click event
    logoutButton.addEventListener("click", function () {
      signOut();
    });
})