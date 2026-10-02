window.ROBOTICS_ANDROID = true;
if (!Object.hasOwn) {
  Object.hasOwn = function (object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  };
}
window.addEventListener('DOMContentLoaded', () => {
  const footer = document.querySelector('.footer');
  if (footer) {
    const about = document.createElement('a');
    about.href = './privacy.html';
    about.textContent = 'О приложении и данных';
    footer.append(about);
  }
});
