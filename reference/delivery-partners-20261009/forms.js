(function () {
  "use strict";

  var config = window.NTE_CONFIG || window.NTE27_CONFIG || {};
  var vatRate = 20;
  var pricingVersion = "NTE27-2026-10-07-VAT";
  var syncConditionalSections = function () {};
  var derivedFieldSynchronizers = [];
  var sponsorPackagePrices = {
    "Headline Partner": 20000, "Gold Partner": 15000, "Premier Partner": 7000, "Champion Partner": 2000,
    "Zone Sponsor": 5000, "Community Stage Sponsor": 6000, "Event Guide Sponsor": 5000, "Delegate Tote Bag Sponsor": 5000, "Helmet Bay Sponsor": 3000,
    "Auditorium Sponsor": 6000, "Wristband Sponsor": 3000
  };
  var exhibitorSpacePrices = {
    "Garage Space - reduced size with power - £599 + VAT": 599,
    "Single Garage - Paddock Side with power - £799 + VAT": 799,
    "Double Garage - Paddock Side with power - £1,299 + VAT": 1299,
    "Single Garage - Track Side - £799 + VAT": 799,
    "Double Garage - Track Side - £1,299 + VAT": 1299,
    "Clean Energy Zone - Single - £499 + VAT": 499,
    "Clean Energy Zone - Double - £849 + VAT": 849,
    "Built Environment Zone - Single - £499 + VAT": 499,
    "Built Environment Zone - Double - £849 + VAT": 849,
    "Manufacturing Zone - Single - £499 + VAT": 499,
    "Manufacturing Zone - Double - £849 + VAT": 849,
    "Defence & Security Zone - Single - £499 + VAT": 499,
    "Defence & Security Zone - Double - £849 + VAT": 849,
    "Digital and Technologies Zone - Single - £499 + VAT": 499,
    "Digital and Technologies Zone - Double - £849 + VAT": 849,
    "FM Zone - Single - £499 + VAT": 499,
    "FM Zone - Double - £849 + VAT": 849,
    "Professional & Financial Zone - Single - £499 + VAT": 499,
    "Professional & Financial Zone - Double - £849 + VAT": 849,
    "Training & Education Zone - Single - £499 + VAT": 499,
    "Any other business - Single - £499 + VAT": 499,
    "Any other business - Double - £849 + VAT": 849,
    "Local Government Authority - Single - £249.50 + VAT": 249.5,
    "Blue Light - Single - £249.50 + VAT": 249.5,
    "Trade Association - Single - £499 + VAT": 499,
    "COBSEO Charity - Single - Free": 0,
    "Non COBSEO Charity - Single - Free": 0
  };
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
        link.title = "The terms are temporarily unavailable.";
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
    syncConditionalSections = syncAll;
    syncAll();
  }

  function configureFieldConstraints() {
    function applyLimit(control, api) {
      if (!control || !/^(INPUT|TEXTAREA)$/.test(control.tagName) || /^(checkbox|radio|hidden|number|date)$/i.test(control.type || "")) return;
      var limit = standardFieldLimits[api] || (config.fieldLimits || {})[api];
      if (limit && (!control.hasAttribute("maxlength") || control.maxLength > limit)) control.maxLength = limit;
    }
    document.querySelectorAll("[data-sf-field]").forEach(function (control) {
      applyLimit(control, control.dataset.sfField);
      if (control.dataset.copyValueFrom) applyLimit(document.getElementById(control.dataset.copyValueFrom), control.dataset.sfField);
    });
    var londonDateParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    var londonDate = ["year", "month", "day"].map(function (partName) {
      return londonDateParts.find(function (part) { return part.type === partName; }).value;
    }).join("-");
    document.querySelectorAll("[data-declaration-date]").forEach(function (control) {
      control.value = londonDate;
    });
    document.querySelectorAll('[data-sf-field="Date_of_Birth__c"]').forEach(function (control) {
      control.max = londonDate;
      control.min = config.dateOfBirthMinDate || "1900-01-01";
    });
  }

  function enableCheckboxChoices() {
    document.querySelectorAll("[data-single-choice-group], [data-exclusive-choice]").forEach(function (group) {
      group.addEventListener("change", function (event) {
        var selected = event.target;
        if (!selected || selected.type !== "checkbox" || !selected.checked) return;
        group.querySelectorAll('input[type="checkbox"]').forEach(function (control) {
          if (control !== selected && (group.hasAttribute("data-single-choice-group") || selected.value === group.dataset.exclusiveChoice || control.value === group.dataset.exclusiveChoice)) {
            control.checked = false;
          }
        });
      });
    });
  }

  function validateCheckboxChoices(form) {
    var invalid = Array.prototype.slice.call(form.querySelectorAll("[data-single-choice-group], [data-exclusive-choice]")).find(function (group) {
      var selected = Array.prototype.slice.call(group.querySelectorAll('input[type="checkbox"]:checked')).filter(function (control) { return !control.disabled; });
      return selected.length > 1 && (group.hasAttribute("data-single-choice-group") || selected.some(function (control) { return control.value === group.dataset.exclusiveChoice; }));
    });
    if (!invalid) return true;
    return setRuleError(form, invalid.querySelector('input[type="checkbox"]'), invalid.hasAttribute("data-single-choice-group")
      ? "Please select one hours option."
      : "Please select Any or your preferred days.");
  }

  function syncCombinedFields(form) {
    form.querySelectorAll("[data-combine-fields]").forEach(function (target) {
      var ids = target.dataset.combineFields.split(",");
      target.value = ids.map(function (id) {
        var source = document.getElementById(id.trim());
        return source && !source.disabled ? source.value.trim() : "";
      }).filter(Boolean).join(" ");
    });
    form.querySelectorAll("[data-copy-value-from]").forEach(function (target) {
      var source = document.getElementById(target.dataset.copyValueFrom);
      target.value = source && !source.disabled ? source.value : "";
    });
    form.querySelectorAll("[data-checkbox-copy-from]").forEach(function (target) {
      var source = document.getElementById(target.dataset.checkboxCopyFrom);
      var selected = source && !source.disabled && (source.type === "checkbox" ? source.checked : source.value === "Yes");
      target.value = selected ? "1" : "";
    });
    form.querySelectorAll("[data-switch-copy]").forEach(function (target) {
      var switcher = document.getElementById(target.dataset.switchCopy);
      var sourceList = switcher && switcher.value === "No" ? target.dataset.copyWhenNo : target.dataset.copyWhenYes;
      var values = (sourceList || "").split(",").map(function (id) {
        var source = document.getElementById(id.trim());
        return source && !source.disabled ? source.value.trim() : "";
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
    var typeField = form.querySelector('[data-sf-field="Web_Form_Type__c"]');
    if (typeField && (typeField.value === "Exhibitor Application" || typeField.value === "Partner / Sponsor Application")) {
      setPricingField(form, "Payment_Method__c", typeField.value === "Exhibitor Application" ? "Stripe" : "Manual");
      setPricingField(form, "Invoice_Requested__c", typeField.value === "Exhibitor Application" ? "No" : "Yes");
    }
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
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100))) {
      throw new RangeError("The price for a selected option is unavailable. Refresh the page and try again.");
    }
    return Number(value);
  }

  function vatTotals(net) {
    var netPence = Math.round(Number(net) * 100);
    if (!Number.isSafeInteger(netPence) || netPence < 0) throw new RangeError("The total price is unavailable.");
    var vatPence = Math.round(netPence * vatRate / 100);
    return {net: netPence / 100, vat: vatPence / 100, gross: (netPence + vatPence) / 100};
  }

  function totalText(net) {
    var totals = vatTotals(net);
    var money = new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP"});
    return money.format(totals.net) + " + " + money.format(totals.vat) + " VAT (" + vatRate + "%)\nTotal " + money.format(totals.gross) + " including VAT";
  }

  function calculatePartnerPricing(selectedPrices) {
    var totalPence = selectedPrices.reduce(function (sum, rawPrice) { return sum + Math.round(catalogPrice(rawPrice) * 100); }, 0);
    if (!Number.isSafeInteger(totalPence)) throw new RangeError("The package price is unavailable. Refresh the page and try again.");
    var total = totalPence / 100;
    return {packageTotal: total, total: total};
  }

  function qualifiesForPowerDiscount(category) {
    return ["Charity - member of Cobseo", "Charity - not a member of Cobseo", "Government or Government Agency", "Local Government or LG related", "Employer - Blue Light & NHS"].indexOf(String(category || "")) !== -1;
  }

  function includedStaffForSpace(spaceName) {
    var value = String(spaceName || "");
    if (!value) return null;
    var knownFixedSpace = Object.prototype.hasOwnProperty.call(exhibitorSpacePrices, value);
    if (!knownFixedSpace) return null;
    if (/Double Garage| - Double -/.test(value)) return 4;
    return 2;
  }

  function calculateExhibitorPricing(options) {
    options = options || {};
    var spacePrice = catalogPrice(options.spacePrice);
    var discounted = qualifiesForPowerDiscount(options.category);
    function wholeCount(value, label, maximum) {
      var count = value == null || value === "" ? 0 : Number(value);
      if (!Number.isInteger(count) || count < 0 || count > maximum) throw new RangeError("Enter a whole number of " + label + " between 0 and " + maximum + ".");
      return count;
    }
    var socketCount = options.powerRequired === "Yes" ? wholeCount(options.socketCount, "sockets", 20) : 0;
    var plannedStaffCount = wholeCount(options.plannedStaffCount, "staff", 99);
    var includedStaffCount = wholeCount(options.includedStaffCount, "included staff", 99);
    var hasAllocation = options.includedStaffCount != null && Number.isFinite(plannedStaffCount) && plannedStaffCount > 0
      && Number.isFinite(includedStaffCount) && includedStaffCount >= 0;
    var staffCount = hasAllocation
      ? Math.max(0, plannedStaffCount - includedStaffCount)
      : wholeCount(options.staffCount, "additional staff", 99);
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
        pricing = calculatePartnerPricing(selected.map(packagePrice));
      } catch (error) {
        totalNode.textContent = error.message;
        if (form) {
          setPricingField(form, "Sponsor_Package_Total__c", "");
          setPricingField(form, "Listed_Price_Total__c", "");
          setPricingField(form, "Pricing_Status__c", "Review required");
        }
        return;
      }
      totalNode.textContent = totalText(pricing.total);
      if (form) {
        setPricingField(form, "Sponsor_Package_Total__c", pricing.packageTotal);
        setPricingField(form, "Listed_Price_Total__c", pricing.total);
        setPricingField(form, "Pricing_Status__c", "Calculated");
        setPricingField(form, "Pricing_Version__c", pricingVersion);
      }
    }
    checkboxes.forEach(function (box) { box.addEventListener("change", sync); });
    derivedFieldSynchronizers.push(sync);
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
      var space = form.querySelector('[name="exhibitor-space"]:checked');
      var complimentaryBenefits = form.querySelector('[data-complimentary-benefits]');
      if (complimentaryBenefits) complimentaryBenefits.hidden = !space || !/^(?:COBSEO|Non COBSEO) Charity - Single - Free$/.test(space.value);
      var savings = form.querySelector('[data-discount-savings]');
      if (savings) { savings.hidden = true; savings.textContent = ""; }
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
          spacePrice: space ? exhibitorSpacePrice(space) : 0,
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
      var declarationNumber = document.getElementById("declaration-number");
      if (declarationNumber) declarationNumber.textContent = pricing.invoiceRequired ? "8" : "7";
      if (output) {
        output.textContent = space ? totalText(total) : "Select a space to see your total including VAT.";
      }

      if (savings && space) {
        var halfPriceSpace = /^(?:Local Government Authority|Blue Light) - Single - /.test(space.value);
        var spaceSaving = halfPriceSpace ? exhibitorSpacePrices["Any other business - Single - £499 + VAT"] - pricing.spacePrice : 0;
        var powerSaving = pricing.discounted && pricing.powerTotal > 0 ? socketCount * 100 - pricing.powerTotal : 0;
        var savingTotal = spaceSaving + powerSaving;
        if (savingTotal > 0) {
          var money = new Intl.NumberFormat("en-GB", {style:"currency",currency:"GBP"});
          savings.textContent = "50% discount applied: you save " + money.format(vatTotals(savingTotal).gross) + " including VAT on " + (spaceSaving > 0 && powerSaving > 0 ? "your space and power sockets." : spaceSaving > 0 ? "your space." : "power sockets.");
          savings.hidden = false;
        }
      }
    }
    form.addEventListener("change", sync);
    form.addEventListener("input", sync);
    derivedFieldSynchronizers.push(sync);
    sync();
  }

  function setupStaffUpdates() {
    var form = document.querySelector('[data-form-kind="exhibitor-staff-update"]');
    if (!form) return;
    function sync() {
      var required = (document.getElementById("top-up-required") || {}).value === "Yes";
      var count = required ? Number((document.getElementById("top-up-count") || {}).value || 0) : 0;
      setPricingField(form, "Top_Up_Staff_Unit_Price__c", count > 0 ? 50 : 0);
      setPricingField(form, "Top_Up_Staff_Total__c", count > 0 ? count * 50 : 0);
      var estimate = document.querySelector("[data-top-up-estimate]");
      if (estimate) estimate.textContent = totalText(count * 50);
    }
    form.addEventListener("change", sync);
    form.addEventListener("input", sync);
    derivedFieldSynchronizers.push(sync);
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
    setStatus(form, "Please complete the highlighted required fields.", "error");
    blank.setCustomValidity("Please enter a value.");
    blank.reportValidity();
    blank.focus();
    return true;
  }

  function normalizeBookingReferences(form) {
    form.querySelectorAll('[data-sf-field="Target_Booking_Reference__c"], [data-sf-field="Booking_Reference__c"]').forEach(function (control) {
      control.value = String(control.value || "").trim().toUpperCase();
    });
  }

  function validateBookingReferences(form) {
    var invalid = Array.prototype.slice.call(form.querySelectorAll('[data-sf-field="Target_Booking_Reference__c"], [data-sf-field="Booking_Reference__c"]')).find(function (control) {
      return !control.disabled && control.value && !/^NTE-[A-Z0-9][A-Z0-9-]{1,74}[A-Z0-9]$/.test(control.value);
    });
    if (!invalid) return true;
    return setRuleError(form, invalid.type === "hidden" ? null : invalid, invalid.type === "hidden"
      ? "Your booking reference could not be created. Reload the page and try again."
      : "Enter the full booking reference beginning NTE- from your confirmation email.");
  }

  function validateFieldLengths(form) {
    var invalid = Array.prototype.slice.call(form.querySelectorAll("input, textarea")).find(function (control) {
      if (control.disabled || /^(checkbox|radio|number|date)$/.test(control.type || "")) return false;
      var limit = control.maxLength > -1 ? control.maxLength : standardFieldLimits[control.dataset.sfField] || (config.fieldLimits || {})[control.dataset.sfField];
      return limit && String(control.value || "").trim().length > limit;
    });
    if (!invalid) return true;
    var limit = invalid.maxLength > -1 ? invalid.maxLength : standardFieldLimits[invalid.dataset.sfField] || (config.fieldLimits || {})[invalid.dataset.sfField];
    var visible = invalid.type === "hidden" ? document.getElementById(invalid.dataset.copyValueFrom || "") : invalid;
    return setRuleError(form, visible, "Please shorten this value to " + limit + " characters or fewer.");
  }

  function validateEmailAddresses(form) {
    var invalid = Array.prototype.slice.call(form.querySelectorAll('input[type="email"]')).find(function (control) {
      var value = String(control.value || "").trim();
      return !control.disabled && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    });
    return !invalid || setRuleError(form, invalid, "Enter a complete email address, such as name@example.com.");
  }

  function formatWebToLeadDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || config.salesforceDateFormat !== "DMY") return value;
    return match[3] + "/" + match[2] + "/" + match[1];
  }

  function setRuleError(form, control, message) {
    setStatus(form, message, "error");
    if (control) {
      control.setCustomValidity(message);
      control.reportValidity();
      control.focus();
    }
    return false;
  }

  function validateCatalogPricing(form) {
    try {
      var space = form.querySelector('[name="exhibitor-space"]:checked');
      if (space) {
        exhibitorSpacePrice(space);
        if (includedStaffForSpace(space.value) == null) {
          throw new RangeError("This space is unavailable. Refresh the page and choose another space.");
        }
      }
      var packages = Array.prototype.slice.call(form.querySelectorAll('[data-sf-field="Sponsor_Package__c"]:checked'));
      calculatePartnerPricing(packages.map(packagePrice));
    } catch (error) {
      return setRuleError(form, null, error.message);
    }
    return true;
  }

  function exhibitorSpacePrice(space) {
    var price = catalogPrice(space.dataset.price);
    if (!Object.prototype.hasOwnProperty.call(exhibitorSpacePrices, space.value) || exhibitorSpacePrices[space.value] !== price) {
      throw new RangeError("This space is unavailable. Refresh the page and choose another space.");
    }
    return price;
  }

  function packagePrice(box) {
    var price = catalogPrice(box.dataset.packagePrice);
    if (!Object.prototype.hasOwnProperty.call(sponsorPackagePrices, box.value) || sponsorPackagePrices[box.value] !== price) {
      throw new RangeError("This package is unavailable. Refresh the page and choose another package.");
    }
    return price;
  }

  function validateStaffUpdate(form) {
    if (form.dataset.formKind === "partner-staff-update") {
      var partnerTotalControl = document.getElementById("partner-staff-total");
      var partnerTotal = Number(partnerTotalControl && partnerTotalControl.value);
      if (!Number.isInteger(partnerTotal) || partnerTotal < 1 || partnerTotal > 99) {
        return setRuleError(form, partnerTotalControl, "Enter a whole number between 1 and 99 for the final number attending.");
      }
    }
    if (form.dataset.formKind === "exhibitor-staff-update") {
      var baseNamesControl = document.getElementById("exhibitor-staff-names");
      var topUpRequired = (document.getElementById("top-up-required") || {}).value === "Yes";
      if (topUpRequired) {
        var topUpCountControl = document.getElementById("top-up-count");
        var topUpNamesControl = document.getElementById("top-up-names");
        var topUpCount = Number((topUpCountControl || {}).value);
        if (!Number.isInteger(topUpCount) || topUpCount < 1 || topUpCount > 99) {
          return setRuleError(form, topUpCountControl, "Enter a whole number between 1 and 99 for the top-up places.");
        }
        var combinedNames = [String((baseNamesControl || {}).value || "").trim(), String((topUpNamesControl || {}).value || "").trim()].filter(Boolean).join("\n");
        if (combinedNames.length > 32768) return setRuleError(form, topUpNamesControl, "Please shorten the combined staff lists to 32768 characters or fewer.");
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
      return /__c$/.test(api) && !(config.customFieldIds || {})[api];
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
    postForm.acceptCharset = "UTF-8";
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
    try {
      postForm.submit();
    } catch (error) {
      postForm.remove();
      throw error;
    }
  }

  function syncFormState(form) {
    configureFieldConstraints();
    syncConditionalSections();
    form.querySelectorAll('input[type="number"]').forEach(function (control) {
      if (control.disabled || !String(control.value || "").trim()) return;
      var value = Number(control.value);
      if (Number.isFinite(value)) control.value = String(value);
    });
    derivedFieldSynchronizers.forEach(function (sync) { sync(); });
    syncConditionalSections();
    syncCombinedFields(form);
    normalizeBookingReferences(form);
  }

  function clearRuleErrors(form) {
    form.querySelectorAll("input, select, textarea").forEach(function (control) { control.setCustomValidity(""); });
  }

  function restoreSubmitControls(form) {
    delete form.dataset.submitting;
    form.removeAttribute("aria-busy");
    form.querySelectorAll('[type="submit"]').forEach(function (button) {
      if (button.dataset.originalText == null) return;
      button.disabled = false;
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    });
  }

  function enableForms() {
    document.querySelectorAll("form[data-web-to-lead]").forEach(function (form) {
      // Normalise references and refresh conditional requirements before asking
      // the browser to validate; reportValidity still enforces native rules.
      form.noValidate = true;
      var validateCodeOfConduct = setupCodeOfConduct(form);
      try {
        populateSystemFields(form);
      } catch (error) {
        setStatus(form, "This form is currently unavailable. Reload the page and try again.", "error");
      }
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
        clearRuleErrors(form);
        try {
          populateSystemFields(form);
          syncFormState(form);
        } catch (error) {
          setStatus(form, "This form is currently unavailable. Reload the page and try again.", "error");
          return;
        }
        var incompleteGroup = Array.prototype.slice.call(form.querySelectorAll("[data-required-checkbox-group]")).find(function (group) {
          var available = Array.prototype.slice.call(group.querySelectorAll('input[type="checkbox"]')).filter(function (control) { return !control.disabled; });
          return available.length && !available.some(function (control) { return control.checked; });
        });
        if (incompleteGroup) {
          setStatus(form, incompleteGroup.dataset.requiredMessage || "Please select at least one option.", "error");
          var firstBox = incompleteGroup.querySelector('input[type="checkbox"]');
          if (firstBox) firstBox.focus();
          return;
        }
        if (hasBlankRequiredText(form)) return;
        if (!validateCheckboxChoices(form)) return;
        if (!validateCodeOfConduct()) return;
        if (!validateFieldLengths(form) || !validateEmailAddresses(form) || !validateBookingReferences(form) || !validateCatalogPricing(form) || !validateStaffUpdate(form) || !validateHeavyItems(form)) return;
        if (!form.checkValidity()) {
          setStatus(form, "Please complete the highlighted required fields.", "error");
          form.reportValidity();
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
          setStatus(form, "This form is currently unavailable. Please try again later.", "error");
          return;
        }
        if (missing.length) {
          setStatus(form, "This form is currently unavailable. Please try again later.", "error");
          return;
        }
        form.dataset.submitting = "true";
        form.setAttribute("aria-busy", "true");
        form.querySelectorAll('[type="submit"]').forEach(function (button) {
          button.disabled = true;
          button.dataset.originalText = button.textContent;
          button.textContent = "Submitting…";
        });
        try {
          submitToSalesforce(form, grouped);
        } catch (error) {
          restoreSubmitControls(form);
          setStatus(form, "Your submission could not be sent. Please try again.", "error");
        }
      });
      function changed() {
        clearRuleErrors(form);
        syncCombinedFields(form);
      }
      form.addEventListener("input", changed);
      form.addEventListener("change", changed);
      form.addEventListener("focusin", function (event) {
        if (event.target && event.target.type === "date") configureFieldConstraints();
      });
    });
    if (window.addEventListener) window.addEventListener("pageshow", function () {
      configureFieldConstraints();
      document.querySelectorAll("form[data-web-to-lead]").forEach(function (form) {
        restoreSubmitControls(form);
        clearRuleErrors(form);
        try {
          populateSystemFields(form);
          syncFormState(form);
        } catch (error) {
          setStatus(form, "This form is currently unavailable. Reload the page and try again.", "error");
        }
      });
    });
  }

  function setupCodeOfConduct(form) {
    if (!form.hasAttribute("data-require-code-of-conduct")) return function () { return true; };
    var details = form.querySelector("[data-conduct-document]");
    var reader = form.querySelector("[data-conduct-reader]");
    var acknowledgement = form.querySelector("[data-conduct-acknowledgement]");
    var version = form.querySelector("[data-conduct-version]");
    var status = form.querySelector("[data-conduct-status]");
    if (!details || !reader || !acknowledgement || !version || !status || !details.dataset.conductDocument) {
      return function () { return setRuleError(form, null, "The Code of Conduct is unavailable. Reload the page and try again."); };
    }
    var documentVersion = details.dataset.conductDocument;
    var reachedEnd = false;
    function sync() {
      acknowledgement.disabled = !reachedEnd;
      if (!reachedEnd) acknowledgement.checked = false;
      version.disabled = !reachedEnd || !acknowledgement.checked;
      version.value = version.disabled ? "" : documentVersion;
      status.textContent = reachedEnd ? "You can now tick the acknowledgement below." : "Read to the end to enable the acknowledgement.";
    }
    function checkEnd() {
      // Closed details have no rendered height. Never count them as a short document.
      if (!reachedEnd && details.open && reader.clientHeight > 0 && reader.scrollHeight > 0 &&
          reader.scrollHeight - reader.clientHeight - reader.scrollTop <= 2) {
        reachedEnd = true;
        sync();
      }
    }
    details.addEventListener("toggle", function () {
      if (details.open) {
        reader.focus();
        checkEnd();
      }
    });
    reader.addEventListener("scroll", checkEnd);
    acknowledgement.addEventListener("change", sync);
    window.addEventListener("resize", checkEnd);
    window.addEventListener("pageshow", sync);
    form.addEventListener("reset", function () {
      reachedEnd = false;
      details.open = false;
      reader.scrollTop = 0;
      acknowledgement.checked = false;
      sync();
    });
    sync();
    return function () {
      sync();
      if (!reachedEnd) {
        details.open = true;
        setRuleError(form, null, "Please open the Code of Conduct and read to the end.");
        reader.focus();
        return false;
      }
      if (!acknowledgement.checked) return setRuleError(form, acknowledgement, "Please tick to confirm that you have read and agree to follow the Code of Conduct.");
      return true;
    };
  }

  configureShell();
  enableConditionalSections();
  enableCheckboxChoices();
  configureFieldConstraints();
  setupPackageSummary();
  setupExhibitorEstimate();
  setupStaffUpdates();
  enableForms();

  window.NTEFormUtils = {
    eventCodeFor: eventCodeFor,
    resolveEventCode: resolveEventCode,
    bookingReference: bookingReference,
    vatTotals: vatTotals,
    totalText: totalText,
    calculatePartnerPricing: calculatePartnerPricing,
    calculateExhibitorPricing: calculateExhibitorPricing,
    includedStaffForSpace: includedStaffForSpace,
    qualifiesForPowerDiscount: qualifiesForPowerDiscount,
    formatWebToLeadDate: formatWebToLeadDate,
    resolveReturnUrl: resolveReturnUrl
  };
}());
