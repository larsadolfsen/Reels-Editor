// Style tab composer: renders the shared saved-style preset library into a panel's Style tab
// body. Called by both panel-text.js and panel-captions.js, so the two tabs cannot diverge.
window.StyleTab = window.StyleTab || {};

// styleLibrary(container, target, options) -> { render() }. render() is async (the library
// section awaits Api.listPresets); callers ignore the returned promise, as the panels do today.
window.StyleTab.styleLibrary = function styleLibrary(container, target, options) {
  const library = StyleSection.presetLibrary(container, target, {});
  return {
    render() { return library.render(); },
  };
};
