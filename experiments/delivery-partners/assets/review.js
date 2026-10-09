(function () {
  'use strict';
  var form = document.querySelector('form[data-web-to-lead]');
  var routes = new URLSearchParams(window.location.search).getAll('partner');
  var validLink = routes.length === 0 || (routes.length === 1 && routes[0] === 'delivery');
  var delivery = validLink && routes[0] === 'delivery';
  var review = document.querySelector('[data-application-review]');
  var title = document.querySelector('.hero h1');
  var inputTitle = delivery ? 'Delivery partner application' : 'Partner / sponsor application';

  function field(api, value) {
    var input = form.querySelector('[data-sf-field="' + api + '"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.dataset.sfField = api;
      form.prepend(input);
    }
    input.value = value;
    input.defaultValue = value;
  }

  // Link routing controls presentation; it cannot verify an invitation.
  function applyRoute() {
    if (!delivery) return;
    field('Sponsor_Package__c', 'Delivery Partner');
    field('Invoice_Required__c', 'No');
    field('Invoice_Requested__c', 'No');
    field('Sponsor_Package_Total__c', '0');
    field('Listed_Price_Total__c', '0');
    field('Form_Version__c', 'delivery-partner-routing-review-v1');
    var paymentMethod = form.querySelector('[data-sf-field="Payment_Method__c"]');
    if (paymentMethod) paymentMethod.remove();
  }

  if (validLink && delivery) {
    form.querySelector('[data-package-section]').remove();
    form.querySelector('[data-billing-section]').remove();
    // Retain the shared form type for the existing partner operational pipeline.
    applyRoute();
    title.textContent = inputTitle;
    document.title = 'NTE27 Delivery Partner Application';
    form.setAttribute('aria-label', inputTitle);
    var intro = form.querySelector('section.card');
    intro.querySelector('p:last-child').textContent = 'Thank you for helping deliver NTE27. Please share your organisation, contact and exhibition details so we can prepare for your team’s attendance.';
    document.querySelector('#partner-power').parentElement.querySelector('.help').textContent = 'Please let us know what your team needs on the day.';
    document.querySelector('#partner-planned-count').parentElement.querySelector('.help').textContent = 'Please provide the final names nearer the event using the staff update link from the NTE team.';
    Array.prototype.forEach.call(form.querySelectorAll('.section-number'), function (number, index) {
      number.textContent = String(index + 1);
    });
  }

  function addRow(list, label, value) {
    if (!value) return;
    var term = document.createElement('dt');
    term.textContent = label;
    var description = document.createElement('dd');
    description.textContent = value;
    list.append(term, description);
  }

  function show(application, grouped) {
    if (!validLink || application !== form) return;
    var summary = document.querySelector('[data-review-summary]');
    summary.replaceChildren();
    var first = function (api) { return (grouped[api] || []).join('; '); };
    var overview = document.createElement('dl');
    overview.className = 'review-details';
    addRow(overview, 'Application', delivery ? 'Delivery partner' : 'Partner / sponsor');
    if (!delivery) {
      addRow(overview, 'Selected packages', first('Sponsor_Package__c'));
      addRow(overview, 'Package total', window.NTEFormUtils.totalText(Number(first('Listed_Price_Total__c'))));
    }
    summary.append(overview);
    form.querySelectorAll('section.card').forEach(function (section) {
      if (section.hasAttribute('data-package-section')) return;
      var controls = Array.prototype.filter.call(section.querySelectorAll('input, select, textarea'), function (control) {
        return !control.disabled && control.type !== 'hidden' && control.type !== 'checkbox' && control.value;
      });
      if (!controls.length) return;
      var heading = document.createElement('h3');
      var headingCopy = section.querySelector('h2').cloneNode(true);
      var number = headingCopy.querySelector('.section-number');
      if (number) number.remove();
      heading.textContent = headingCopy.textContent;
      var list = document.createElement('dl');
      list.className = 'review-details';
      controls.forEach(function (control) {
        var label = document.querySelector('label[for="' + control.id + '"]');
        if (label) addRow(list, label.textContent, control.value.trim());
      });
      summary.append(heading, list);
    });
    var acknowledgement = document.createElement('p');
    acknowledgement.textContent = 'Privacy policy: agreed.';
    summary.append(acknowledgement);
    form.hidden = true;
    review.hidden = false;
    title.textContent = 'Review your application';
    document.getElementById('review-heading').focus();
    review.scrollIntoView({block: 'start'});
  }

  document.querySelector('[data-edit-application]').addEventListener('click', function () {
    review.hidden = true;
    document.querySelector('[data-review-summary]').replaceChildren();
    form.hidden = false;
    title.textContent = inputTitle;
    form.querySelector('input:not([type="hidden"])').focus();
  });

  function ready() {
    document.querySelector('[data-loading]').hidden = true;
    if (!validLink) {
      document.querySelector('[data-link-error]').hidden = false;
      return;
    }
    form.hidden = false;
    form.querySelector('[type="submit"]').disabled = false;
  }

  window.NTEPartnerReview = Object.freeze({applyRoute: applyRoute, show: show, ready: ready});
})();
