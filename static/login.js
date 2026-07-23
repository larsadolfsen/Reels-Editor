// Login page: shows the error message when redirected back with ?error=1.
if (new URLSearchParams(window.location.search).get("error") === "1") {
  document.getElementById("login-error").hidden = false;
}
