(function () {
  "use strict";

  var config = window.NTE_CONFIG || window.NTE27_CONFIG || {};
  var pricingVersion = "NTE27-2026-09-06";
  var standardNames = {
    Company: "company",
    FirstName: "first_name",
    LastName: "last_name",
    Email: "email",
    Phone: "phone",
    MobilePhone: "mobile",
    Title: "title",
    Website: "URL",
    Salutation: "salutation",
    Street: "street",
    PostalCode: "zip"
  };
  var standardFieldLimits = {
    Company: 255,
    FirstName: 40,
    LastName: 80,
    Email: 80,
    Phone: 40,
    MobilePhone: 40,
    Title: 128,
    Website: 255,
    Salutation: 40,
    Street: 255,
    PostalCode: 20
  };

  function setStatus(form, message, type) {
    var status = form.querySelector("[data-form-status]");
    if (!status) return;
    status.textContent = message;
    status.className = "status " + type;
    status.hidden = false;
    status.setAttribute("tabindex", "-1");
    status.focus();
  }

  function configureShell() {
    if (config.siteNotice && document.body && document.createElement && !document.querySelector("[data-site-notice]")) {
      var notice = document.createElement("aside");
      notice.className = "sandbox-notice";
      notice.setAttribute("data-site-notice", "");
      notice.textContent = config.siteNotice;
      var main = document.querySelector("main");
      if (main) main.parentNode.insertBefore(notice, main);
    }
    document.querySelectorAll("[data-current-year]").forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });
    document.querySelectorAll('[data-config-link="terms"]').forEach(function (link) {
      if (config.termsUrl) {
        link.href = config.termsUrl;
        if (config.termsLinkLabel) link.textContent = config.termsLinkLabel;
      } else {
        link.href = "#terms-link-required";
        link.setAttribute("aria-disabled", "true");
        link.title = "The final NTE27 Terms and Conditions PDF URL is still required.";
        link.addEventListener("click", function (event) { event.preventDefault(); });
      }
    });
    document.querySelectorAll('[data-config-link="logo"]').forEach(function (link) {
      if (config.logoFileRequestUrl) {
        link.href = config.logoFileRequestUrl;
        link.removeAttribute("aria-disabled");
      } else {
        link.href = "#logo-link-required";
        link.setAttribute("aria-disabled", "true");
        link.title = "The secure upload link is not currently available.";
        link.addEventListener("click", function (event) { event.preventDefault(); });
      }
    });
  }

  function enableConditionalSections() {
    var targets = Array.prototype.slice.call(document.querySelectorAll("[data-conditional-for]"));

    function syncAll() {
      targets.forEach(function (target) {
        var source = document.getElementById(target.dataset.conditionalFor);
        if (!source) return;
        var expected = (target.dataset.conditionalValue || "Yes").split("|");
        var value = source.type === "checkbox" ? (source.checked ? "Yes" : "No") : (source.type === "radio" ? (source.checked ? source.value : "") : source.value);
        var parentConditional = target.parentElement && target.parentElement.closest("[data-conditional-for]");
        var show = expected.indexOf(value) !== -1 && (!parentConditional || !parentConditional.hidden);
        target.hidden = !show;
        target.querySelectorAll("input, select, textarea, button").forEach(function (control) {
          if (control.closest("[data-conditional-for]") !== target) return;
          control.disabled = !show;
          if (control.hasAttribute("data-required-when-visible")) control.required = show;
        });
      });
    }

    targets.forEach(function (target) {
      var source = document.getElementById(target.dataset.conditionalFor);
      if (!source) return;
      source.addEventListener("change", syncAll);
      if (source.type === "radio" && source.name) {
        document.querySelectorAll('input[type="radio"][name="' + source.name + '"]').forEach(function (radio) { radio.addEventListener("change", syncAll); });
      }
    });
    syncAll();
  }

  function configureFieldConstraints() {
    document.querySelectorAll("[data-sf-field]").forEach(function (control) {
      if (!/^(INPUT|TEXTAREA)$/.test(control.tagName) || /^(checkbox|radio|hidden)$/i.test(control.type || "")) return;
      var limit = standardFieldLimits[control.dataset.sfField] || (config.fieldLimits || {})[control.dataset.sfField];
      if (limit && !control.hasAttribute("maxlength")) control.maxLength = limit;
    });
    var londonDateParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    var londonDate = ["year", "month", "day"].map(function (partName) {
      return londonDateParts.find(function (part) { return part.type === partName; }).value;
    }).join("-");
    document.querySelectorAll('[data-sf-field="Declaration_Date__c"]').forEach(function (control) {
      control.max = londonDate;
      if (config.declarationMinDate) control.min = config.declarationMinDate;
    });
    document.querySelectorAll('[data-sf-field="Date_of_Birth__c"]').forEach(function (control) {
      control.max = londonDate;
      control.min = config.dateOfBirthMinDate || "1900-01-01";
    });
  }

  function syncCombinedFields(form) {
    form.querySelectorAll("[data-combine-fields]").forEach(function (target) {
      var ids = target.dataset.combineFields.split(",");
      target.value = ids.map(function (id) {
        var source = document.getElementById(id.trim());
        return source ? source.value.trim() : "";
      }).filter(Boolean).join(" ");
    });
    form.querySelectorAll("[data-copy-value-from]").forEach(function (target) {
      var source = document.getElementById(target.dataset.copyValueFrom);
      target.value = source ? source.value : "";
    });
    form.querySelectorAll("[data-checkbox-copy-from]").forEach(function (target) {
      var source = document.getElementById(target.dataset.checkboxCopyFrom);
      var selected = source && (source.type === "checkbox" ? source.checked : source.value === "Yes");
      target.value = selected ? "1" : "";
    });
    form.querySelectorAll("[data-switch-copy]").forEach(function (target) {
      var switcher = document.getElementById(target.dataset.switchCopy);
      var sourceList = switcher && switcher.value === "No" ? target.dataset.copyWhenNo : target.dataset.copyWhenYes;
      var values = (sourceList || "").split(",").map(function (id) {
        var source = document.getElementById(id.trim());
        return source ? source.value.trim() : "";
      }).filter(Boolean);
      target.value = target.dataset.copyMode === "combine" ? values.join(" ") : (values[0] || "");
    });
  }

  function eventCodeFromParts(year, month) {
    return "NTE" + String(month >= 4 ? year + 1 : year);
  }

  function pureDateParts(value) {
    var match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
      throw new RangeError("Invalid calendar date: " + value);
    }
    return {year: year, month: month, day: day};
  }

  function eventCodeFor(date, timeZone) {
    var pureDate = pureDateParts(date);
    if (pureDate) return eventCodeFromParts(pureDate.year, pureDate.month);

    var instant = date == null ? new Date() : date;
    if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
      throw new TypeError("eventCodeFor requires a valid Date or YYYY-MM-DD value");
    }
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || "Europe/London",
      year: "numeric",
      month: "numeric"
    }).formatToParts(instant);
    var year = Number(parts.find(function (part) { return part.type === "year"; }).value);
    var month = Number(parts.find(function (part) { return part.type === "month"; }).value);
    return eventCodeFromParts(year, month);
  }

  function resolveEventCode(date) {
    var override = String(config.eventCodeOverride || "").trim();
    if (override) {
      if (!/^NTE\d{4}$/.test(override)) throw new Error("NTE event code override must use the format NTEYYYY");
      return override;
    }
    return eventCodeFor(date, config.eventCodeTimeZone || "Europe/London");
  }

  function bookingReference() {
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var bytes = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      bytes.forEach(function (_, index) { bytes[index] = Math.floor(Math.random() * 256); });
    }
    var suffix = Array.prototype.map.call(bytes, function (value) {
      return alphabet.charAt(value % alphabet.length);
    }).join("");
    return "NTE-" + Date.now() + "-" + suffix;
  }

  function populateSystemFields(form) {
    var eventField = form.querySelector('[data-sf-field="NTE_Event_Code__c"]');
    if (eventField) eventField.value = resolveEventCode(new Date());
    var bookingField = form.querySelector('[data-sf-field="Booking_Reference__c"]');
    if (bookingField && !bookingField.value) bookingField.value = bookingReference();
    var logoField = form.querySelector('[data-sf-field="Logo_Upload_URL__c"]');
    if (logoField) logoField.value = config.logoFileRequestUrl || "";
  }

  function setPricingField(form, api, value) {
    var field = form.querySelector('[data-sf-field="' + api + '"]');
    if (field) field.value = String(value);
  }

  function catalogPrice(rawPrice) {
    var value = typeof rawPrice === "string" || typeof rawPrice === "number" ? String(rawPrice).trim() : "";
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value))) {
      throw new RangeError("The price for a selected option is unavailable. Refresh the page and try again.");
    }
    return Number(value);
  }

  function calculatePartnerPricing(selectedPrices) {
    var total = selectedPrices.reduce(function (sum, rawPrice) { return sum + catalogPrice(rawPrice); }, 0);
    return {packageTotal: total, total: total};
  }

  function qualifiesForPowerDiscount(category) {
    return /Charity|Government|Blue Light/i.test(String(category || ""));
  }

  function includedStaffForSpace(spaceName) {
    var value = String(spaceName || "");
    if (!value) return null;
    var knownFixedSpace = /^(Garage Space - reduced size with power|Single Garage - Paddock Side with power|Double Garage - Paddock Side with power|Single Garage - Track Side|Double Garage - Track Side|Clean Energy Zone - (Single|Double)|Built Environment Zone - (Single|Double)|Manufacturing Zone - (Single|Double)|Defence & Security Zone - (Single|Double)|Digital and Technologies Zone - (Single|Double)|FM Zone - (Single|Double)|Professional & Financial Zone - (Single|Double)|Training & Education Zone - Single|Any other business - (Single|Double)|Local Government Authority - Single|Blue Light - Single|Trade Association - Single|COBSEO Charity - Single|Non COBSEO Charity - Single)/.test(value);
    if (!knownFixedSpace) return null;
    if (/Double Garage| - Double -/.test(value)) return 4;
    return 2;
  }

  function calculateExhibitorPricing(options) {
    options = options || {};
    var spacePrice = catalogPrice(options.spacePrice);
    var discounted = qualifiesForPowerDiscount(options.category);
    var socketCount = Math.max(0, Number(options.socketCount || 0));
    var plannedStaffCount = Number(options.plannedStaffCount);
    var includedStaffCount = Number(options.includedStaffCount);
    var hasAllocation = options.includedStaffCount != null && Number.isFinite(plannedStaffCount) && plannedStaffCount > 0
      && Number.isFinite(includedStaffCount) && includedStaffCount >= 0;
    var staffCount = hasAllocation
      ? Math.max(0, plannedStaffCount - includedStaffCount)
      : Math.max(0, Number(options.staffCount || 0));
    var powerUnitPrice = options.powerRequired === "Yes" ? (discounted ? 50 : 100) : 0;
    var staffUnitPrice = staffCount > 0 ? 50 : 0;
    var powerTotal = powerUnitPrice * socketCount;
    var staffTotal = staffUnitPrice * staffCount;
    var listedTotal = spacePrice + powerTotal + staffTotal;
    return {
      spacePrice: spacePrice,
      powerUnitPrice: powerUnitPrice,
      powerTotal: powerTotal,
      staffUnitPrice: staffUnitPrice,
      staffTotal: staffTotal,
      includedStaffCount: hasAllocation ? includedStaffCount : null,
      additionalStaffCount: staffCount,
      total: listedTotal,
      discounted: discounted,
      invoiceRequired: listedTotal > 0
    };
  }

  function eligibleCategoriesForSpace(spaceName) {
    var restrictions = {
      "Local Government Authority - Single - £249.50 + VAT": ["Local Government or LG related"],
      "Blue Light - Single - £249.50 + VAT": ["Employer - Blue Light & NHS"],
      "Trade Association - Single - £499 + VAT": ["Trade Association"],
      "COBSEO Charity - Single - Free": ["Charity - member of Cobseo"],
      "Non COBSEO Charity - Single - Free": ["Charity - not a member of Cobseo"]
    };
    return restrictions[spaceName] || [];
  }

  function syncExhibitorEligibility(form, category) {
    form.querySelectorAll('[name="exhibitor-space"]').forEach(function (space) {
      var allowed = eligibleCategoriesForSpace(space.value);
      var unavailable = Boolean(category) && allowed.length > 0 && allowed.indexOf(category) === -1;
      if (unavailable && space.checked) space.checked = false;
      space.disabled = unavailable;
      var option = space.closest("label");
      if (option) {
        option.classList.toggle("option-unavailable", unavailable);
        if (unavailable) option.setAttribute("aria-disabled", "true");
        else option.removeAttribute("aria-disabled");
      }
    });
  }

  function setupPackageSummary() {
    var checkboxes = Array.prototype.slice.call(document.querySelectorAll("[data-package-price]"));
    var countNode = document.querySelector("[data-package-count]");
    var totalNode = document.querySelector("[data-package-total]");
    if (!checkboxes.length || !countNode || !totalNode) return;
    function sync() {
      var selected = checkboxes.filter(function (box) { return box.checked; });
      countNode.textContent = selected.length ? selected.length + " package" + (selected.length === 1 ? "" : "s") + " selected" : "No packages selected";
      var form = checkboxes[0].form;
      var pricing;
      try {
        pricing = calculatePartnerPricing(selected.map(function (box) { return box.dataset.packagePrice; }));
      } catch (error) {
        totalNode.textContent = error.message;
        if (form) {
          setPricingField(form, "Sponsor_Package_Total__c", "");
          setPricingField(form, "Listed_Price_Total__c", "");
          setPricingField(form, "Pricing_Status__c", "Review required");
        }
        return;
      }
      totalNode.textContent = "Package total: " + new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP",maximumFractionDigits:0}).format(pricing.total);
      if (form) {
        setPricingField(form, "Sponsor_Package_Total__c", pricing.packageTotal);
        setPricingField(form, "Listed_Price_Total__c", pricing.total);
        setPricingField(form, "Pricing_Status__c", "Calculated");
        setPricingField(form, "Pricing_Version__c", pricingVersion);
      }
    }
    checkboxes.forEach(function (box) { box.addEventListener("change", sync); });
    sync();
  }

  function setupExhibitorEstimate() {
    var form = document.querySelector('[data-form-kind="exhibitor"]');
    if (!form) return;
    var output = document.querySelector("[data-estimate]");
    function checkedValue(name) {
      var node = form.querySelector('[name="' + name + '"]:checked');
      return node ? node.value : "";
    }
    function sync() {
      var category = document.getElementById("organisation-category");
      syncExhibitorEligibility(form, category ? category.value : "");
      var space = form.querySelector('[name="exhibitor-space"]:checked');
      var powerIncluded = space && space.dataset.powerIncluded === "true";
      var powerLabel = document.getElementById("power-question-label");
      var powerHelp = document.getElementById("power-question-help");
      if (powerLabel) powerLabel.textContent = powerIncluded ? "Do you need any additional power sockets for £100 + VAT per socket?" : "Do you need power on your stand for an additional £100 + VAT per socket?";
      if (powerHelp) powerHelp.textContent = powerIncluded ? "Your selected space includes standard power. Select Yes only if you need additional sockets. Charities, government and blue light organisations qualify for a 50% discount on additional sockets." : "Unless indicated here, power may not be possible. Charities, government and blue light organisations qualify for a 50% discount.";
      var socketCount = Number((document.getElementById("power-count") || {}).value || 0);
      var plannedStaffCount = Number((document.getElementById("planned-count") || {}).value || 0);
      var includedStaffCount = space ? includedStaffForSpace(space.value) : null;
      var pricing;
      try {
        if (space && includedStaffCount == null) throw new RangeError("This space is unavailable. Refresh the page and choose another space.");
        pricing = calculateExhibitorPricing({
          spacePrice: space ? space.dataset.price : 0,
          category: category ? category.value : "",
          powerRequired: checkedValue("power-required"),
          socketCount: socketCount,
          plannedStaffCount: plannedStaffCount,
          includedStaffCount: includedStaffCount
        });
      } catch (error) {
        if (output) output.textContent = error.message;
        setPricingField(form, "Exhibitor_Space_Price__c", "");
        setPricingField(form, "Listed_Price_Total__c", "");
        setPricingField(form, "Pricing_Status__c", "Review required");
        return;
      }
      var total = pricing.total;
      var discounted = pricing.discounted;
      setPricingField(form, "Exhibitor_Space_Price__c", pricing.spacePrice);
      setPricingField(form, "Power_Socket_Unit_Price__c", pricing.powerUnitPrice);
      setPricingField(form, "Power_Socket_Total__c", pricing.powerTotal);
      setPricingField(form, "Additional_Staff_Unit_Price__c", pricing.staffUnitPrice);
      setPricingField(form, "Additional_Staff_Total__c", pricing.staffTotal);
      setPricingField(form, "Included_Staff_Count__c", pricing.includedStaffCount == null ? 0 : pricing.includedStaffCount);
      setPricingField(form, "Total_Staff_Count__c", plannedStaffCount || 0);
      setPricingField(form, "Additional_Staff_Required__c", pricing.additionalStaffCount > 0 ? "Yes" : "No");
      setPricingField(form, "Additional_Staff_Count__c", pricing.additionalStaffCount);
      setPricingField(form, "Listed_Price_Total__c", pricing.total);
      setPricingField(form, "Pricing_Status__c", "Calculated");
      setPricingField(form, "Pricing_Version__c", pricingVersion);
      var invoiceField = document.getElementById("invoice-required");
      if (invoiceField) {
        var invoiceValue = pricing.invoiceRequired ? "Yes" : "No";
        if (invoiceField.value !== invoiceValue) {
          invoiceField.value = invoiceValue;
          invoiceField.dispatchEvent(new Event("change", {bubbles: true}));
        }
      }
      var paymentMethod = document.getElementById("payment-method");
      var paymentMethodField = document.querySelector("[data-payment-method-field]");
      if (paymentMethodField) paymentMethodField.hidden = !pricing.invoiceRequired;
      if (paymentMethod) {
        paymentMethod.disabled = !pricing.invoiceRequired;
        paymentMethod.required = pricing.invoiceRequired;
        if (!pricing.invoiceRequired) paymentMethod.value = "";
      }
      if (output) {
        if (!space) output.textContent = "Select a space to see an indicative ex-VAT total.";
        else {
          var parts = ["space " + new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(pricing.spacePrice)];
          if (pricing.powerTotal) parts.push(socketCount + " socket" + (socketCount === 1 ? "" : "s") + " " + new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(pricing.powerTotal));
          if (pricing.staffTotal) parts.push(pricing.additionalStaffCount + " additional staff " + new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(pricing.staffTotal));
          output.textContent = "Indicative ex-VAT total: " + new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(total) + " (" + parts.join(" + ") + ").";
        }
      }
      var discount = document.querySelector("[data-power-discount]");
      if (discount) discount.textContent = discounted ? "Your selected organisation category appears eligible for the 50% power discount; Mission Community will verify eligibility." : "Charities, government and blue-light organisations qualify for a 50% power discount.";
    }
    form.addEventListener("change", sync);
    form.addEventListener("input", sync);
    sync();
  }

  function nonBlankLines(value) {
    return String(value || "").split(/\r?\n/).filter(function (line) { return line.trim(); });
  }

  function setupStaffUpdates() {
    var form = document.querySelector('[data-form-kind="exhibitor-staff-update"]');
    if (!form) return;
    function sync() {
      var baseNames = nonBlankLines((document.getElementById("exhibitor-staff-names") || {}).value);
      var baseCount = document.getElementById("exhibitor-base-count");
      if (baseCount) baseCount.value = String(baseNames.length);
      var required = (document.getElementById("top-up-required") || {}).value === "Yes";
      var count = required ? Number((document.getElementById("top-up-count") || {}).value || 0) : 0;
      setPricingField(form, "Top_Up_Staff_Unit_Price__c", count > 0 ? 50 : 0);
      setPricingField(form, "Top_Up_Staff_Total__c", count > 0 ? count * 50 : 0);
      var estimate = document.querySelector("[data-top-up-estimate]");
      if (estimate) estimate.textContent = "Top-up total: " + new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"}).format(count * 50) + " + VAT";
    }
    form.addEventListener("change", sync);
    form.addEventListener("input", sync);
    sync();
  }

  function collectFields(form) {
    syncCombinedFields(form);
    var grouped = {};
    form.querySelectorAll("[data-sf-field]").forEach(function (control) {
      if (control.disabled) return;
      var api = control.dataset.sfField;
      if (!api) return;
      if ((control.type === "checkbox" || control.type === "radio") && !control.checked) return;
      var value = control.type === "checkbox" && api === "Terms_and_Conditions__c" ? "1" : control.value;
      if (typeof value === "string") value = value.trim();
      if (control.type === "date") value = formatWebToLeadDate(value);
      if (value === "") return;
      if (!grouped[api]) grouped[api] = [];
      grouped[api].push(value);
    });
    return grouped;
  }

  function hasBlankRequiredText(form) {
    var blank = Array.prototype.slice.call(form.querySelectorAll("input[required], textarea[required]")).find(function (control) {
      if (control.disabled || control.type === "checkbox" || control.type === "radio") return false;
      return String(control.value || "").trim() === "";
    });
    if (!blank) return false;
    blank.setCustomValidity("Please enter a value.");
    blank.reportValidity();
    blank.focus();
    return true;
  }

  function normalizeBookingReferences(form) {
    form.querySelectorAll('[data-sf-field="Target_Booking_Reference__c"]').forEach(function (control) {
      control.value = String(control.value || "").trim().toUpperCase();
    });
  }

  function formatWebToLeadDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || config.salesforceDateFormat !== "DMY") return value;
    return match[3] + "/" + match[2] + "/" + match[1];
  }

  function setRuleError(form, control, message) {
    if (control) {
      control.setCustomValidity(message);
      control.reportValidity();
      control.focus();
    }
    setStatus(form, message, "error");
    return false;
  }

  function validateCatalogPricing(form) {
    try {
      var space = form.querySelector('[name="exhibitor-space"]:checked');
      if (space) {
        catalogPrice(space.dataset.price);
        if (includedStaffForSpace(space.value) == null) {
          throw new RangeError("This space is unavailable. Refresh the page and choose another space.");
        }
      }
      var packages = Array.prototype.slice.call(form.querySelectorAll('[data-sf-field="Sponsor_Package__c"]:checked'));
      calculatePartnerPricing(packages.map(function (box) { return box.dataset.packagePrice; }));
    } catch (error) {
      return setRuleError(form, null, error.message);
    }
    return true;
  }

  function validateStaffUpdate(form) {
    if (form.dataset.formKind === "partner-staff-update") {
      var partnerTotalControl = document.getElementById("partner-staff-total");
      var partnerNamesControl = document.getElementById("partner-staff-names");
      var partnerTotal = Number(partnerTotalControl && partnerTotalControl.value);
      var partnerNames = nonBlankLines((partnerNamesControl || {}).value);
      if (!Number.isInteger(partnerTotal) || partnerTotal < 1 || partnerTotal > 99 || partnerNames.length !== partnerTotal) {
        return setRuleError(form, partnerNamesControl, "Enter one attendee name per line so the list matches the final number attending.");
      }
    }
    if (form.dataset.formKind === "exhibitor-staff-update") {
      var baseNamesControl = document.getElementById("exhibitor-staff-names");
      if (!nonBlankLines((baseNamesControl || {}).value).length) {
        return setRuleError(form, baseNamesControl, "Enter the names already covered by your booking, one per line.");
      }
      var topUpRequired = (document.getElementById("top-up-required") || {}).value === "Yes";
      if (topUpRequired) {
        var topUpCountControl = document.getElementById("top-up-count");
        var topUpNamesControl = document.getElementById("top-up-names");
        var topUpCount = Number((topUpCountControl || {}).value);
        var topUpNames = nonBlankLines((topUpNamesControl || {}).value);
        if (!Number.isInteger(topUpCount) || topUpCount < 1 || topUpCount > 99 || topUpNames.length !== topUpCount) {
          return setRuleError(form, topUpNamesControl, "Enter one name per line so the list matches the number of top-up places.");
        }
      }
    }
    return true;
  }

  function validateHeavyItems(form) {
    if (!form.querySelector("#item1-description")) return true;
    for (var itemNumber = 2; itemNumber <= 3; itemNumber++) {
      var description = document.getElementById("item" + itemNumber + "-description");
      var registration = document.getElementById("item" + itemNumber + "-registration");
      var dimensions = document.getElementById("item" + itemNumber + "-dimensions");
      var weight = document.getElementById("item" + itemNumber + "-weight");
      var controls = [description, registration, dimensions, weight];
      var hasAnyValue = controls.some(function (control) { return control && String(control.value || "").trim(); });
      if (hasAnyValue && (!String(description.value || "").trim() || !String(dimensions.value || "").trim() || !String(weight.value || "").trim())) {
        return setRuleError(form, !String(description.value || "").trim() ? description : (!String(dimensions.value || "").trim() ? dimensions : weight),
          "Each additional item needs a description, dimensions and gross weight.");
      }
      if (itemNumber === 3 && hasAnyValue && !String((document.getElementById("item2-description") || {}).value || "").trim()) {
        return setRuleError(form, document.getElementById("item2-description"), "Enter item 2 before adding item 3.");
      }
    }
    return true;
  }

  function missingFieldIds(grouped) {
    return Object.keys(grouped).filter(function (api) {
      return /__c$/.test(api) && !config.customFieldIds[api];
    });
  }

  function missingProductionConfig(form) {
    var missing = [];
    if (!config.endpoint) missing.push("Salesforce endpoint");
    if (!config.orgId) missing.push("Salesforce organisation ID");
    if (!resolveReturnUrl(form)) missing.push("post-submission return URL");
    if (form.querySelector('[data-config-link="terms"]') && !config.termsUrl) missing.push("Terms and Conditions PDF URL");
    return missing;
  }

  function resolveReturnUrl(form) {
    var requestedPath = String((form && form.dataset.returnPath) || "").trim();
    if (!requestedPath) return config.returnUrl || "";
    try {
      if (!window.location || !window.location.href) return config.returnUrl || "";
      var current = new URL(window.location.href);
      var resolved = new URL(requestedPath, current.href);
      if (!/^https?:$/.test(resolved.protocol) || resolved.origin !== current.origin) return config.returnUrl || "";
      return resolved.href;
    } catch (error) {
      return config.returnUrl || "";
    }
  }

  function submitToSalesforce(form, grouped) {
    var postForm = document.createElement("form");
    postForm.method = "post";
    postForm.action = config.endpoint;
    postForm.hidden = true;
    function append(name, value) {
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      postForm.appendChild(input);
    }
    append("oid", config.orgId);
    append("retURL", resolveReturnUrl(form));
    append("lead_source", form.dataset.leadSource || "Web");
    append("useDefaultRule", form.dataset.useDefaultRule === "0" ? "0" : "1");
    Object.keys(grouped).forEach(function (api) {
      var name = /__c$/.test(api) ? config.customFieldIds[api] : (standardNames[api] || api);
      append(name, grouped[api].join(";"));
    });
    document.body.appendChild(postForm);
    postForm.submit();
  }

  function enableForms() {
    document.querySelectorAll("form[data-web-to-lead]").forEach(function (form) {
      populateSystemFields(form);
      var honeypot = document.createElement("input");
      honeypot.type = "text";
      honeypot.name = "website_confirm";
      honeypot.tabIndex = -1;
      honeypot.autocomplete = "off";
      honeypot.setAttribute("aria-hidden", "true");
      honeypot.style.position = "absolute";
      honeypot.style.left = "-10000px";
      honeypot.style.width = "1px";
      honeypot.style.height = "1px";
      honeypot.dataset.formHoneypot = "";
      form.appendChild(honeypot);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (form.dataset.submitting === "true") return;
        if (honeypot.value) {
          setStatus(form, "Your submission could not be processed. Please reload the page and try again.", "error");
          return;
        }
        populateSystemFields(form);
        syncCombinedFields(form);
        normalizeBookingReferences(form);
        var incompleteGroup = Array.prototype.slice.call(form.querySelectorAll("[data-required-checkbox-group]")).find(function (group) {
          return !group.querySelector('input[type="checkbox"]:checked');
        });
        if (incompleteGroup) {
          setStatus(form, incompleteGroup.dataset.requiredMessage || "Please select at least one option.", "error");
          var firstBox = incompleteGroup.querySelector('input[type="checkbox"]');
          if (firstBox) firstBox.focus();
          return;
        }
        form.querySelectorAll("input[required], textarea[required]").forEach(function (control) {
          control.setCustomValidity("");
        });
        if (hasBlankRequiredText(form)) {
          setStatus(form, "Please complete the highlighted required fields.", "error");
          return;
        }
        if (!validateCatalogPricing(form) || !validateStaffUpdate(form) || !validateHeavyItems(form)) return;
        if (!form.reportValidity()) {
          setStatus(form, "Please complete the highlighted required fields.", "error");
          return;
        }
        var grouped = collectFields(form);
        var missing = missingFieldIds(grouped);
        if (config.mode === "review") {
          var confirmation = form.dataset.confirmationPreview || "Thank you. We have received your submission.";
          var reference = grouped.Booking_Reference__c && grouped.Booking_Reference__c[0];
          if (reference) confirmation += " Your booking reference is " + reference + ".";
          setStatus(form, confirmation, "success");
          return;
        }
        var missingConfig = missingProductionConfig(form);
        if (missingConfig.length) {
          setStatus(form, "Submission is disabled because production configuration is missing: " + missingConfig.join(", ") + ".", "error");
          return;
        }
        if (missing.length) {
          setStatus(form, "Submission is disabled because Salesforce field IDs are missing for: " + missing.join(", ") + ".", "error");
          return;
        }
        form.dataset.submitting = "true";
        form.setAttribute("aria-busy", "true");
        form.querySelectorAll('[type="submit"]').forEach(function (button) {
          button.disabled = true;
          button.dataset.originalText = button.textContent;
          button.textContent = "Submitting…";
        });
        submitToSalesforce(form, grouped);
      });
      form.addEventListener("input", function (event) {
        syncCombinedFields(form);
        if (event.target && event.target.setCustomValidity && String(event.target.value || "").trim()) event.target.setCustomValidity("");
      });
    });
  }

  configureShell();
  enableConditionalSections();
  configureFieldConstraints();
  setupPackageSummary();
  setupExhibitorEstimate();
  setupStaffUpdates();
  enableForms();

  window.NTEFormUtils = {
    eventCodeFor: eventCodeFor,
    resolveEventCode: resolveEventCode,
    bookingReference: bookingReference,
    calculatePartnerPricing: calculatePartnerPricing,
    calculateExhibitorPricing: calculateExhibitorPricing,
    includedStaffForSpace: includedStaffForSpace,
    qualifiesForPowerDiscount: qualifiesForPowerDiscount,
    eligibleCategoriesForSpace: eligibleCategoriesForSpace,
    formatWebToLeadDate: formatWebToLeadDate,
    resolveReturnUrl: resolveReturnUrl
  };
}());
