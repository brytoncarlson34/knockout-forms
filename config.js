/* Knockout Forms app config.
   Business branding and the list of forms live here, so a new form is one more entry
   in FORMS and a new business is a new BUSINESS block. Later this file becomes one
   "pack" inside the shared CRM (pack: 'plumbing'). */
window.APP_CONFIG = {
  business: {
    id: 'knockout',
    name: 'Knockout Plumbing',
    tagline: "We're in your corner.",
    phone: '',            // set in the app: Settings > Business look
    email: '',            // same
    logo: 'logo.png',     // default logo; a shop can upload its own in Settings
    colors: { primary: '#B0382E', accent: '#1F2D45', bg: '#F3EBE0' },
    thanks: "Thanks for choosing Knockout Plumbing. We're in your corner. Keep a copy for your records."
  },
  packs: ['plumbing'],
  // Donate spot in Settings. Left blank on purpose for now: the button shows as "coming soon".
  donateUrl: '',

  forms: [
    {
      id: 'wh-agreement', pack: 'plumbing', icon: 'heater',
      title: 'Water Heater Service Agreement', short: 'Water heater plan',
      blurb: 'Yearly water heater plan. Basic or Plus.',
      sections: [
        { title: 'Your water heater', fields: [
          { id: 'wh_type', label: 'Type', type: 'multi', options: ['Tank', 'Tankless'] },
          { id: 'wh_count', label: 'Number of water heaters', type: 'number', half: true }
        ]},
        { title: 'Pick your plan', prices: true, fields: [
          { id: 'plan', type: 'pricegrid', label: 'Plan',
            cols: [{ id: 'tankless', label: 'Tankless' }, { id: 'tank', label: 'Tank' }], unit: '/ year',
            rows: [{ id: 'basic', label: 'BASIC', sub: '1 visit a year' }, { id: 'plus', label: 'PLUS', sub: '2 visits a year' }],
            note: 'Prices are per water heater.' },
          { id: 'extra_visit', label: 'Extra visit', type: 'money', unit: '/ visit', half: true }
        ]},
        { title: 'In your corner every visit', fields: [
          { id: 'included', type: 'static', items: [
            'Flush or descale the water heater', 'Test the relief valve and water pressure', 'Check for leaks',
            'Check venting and gas safety', 'Check earthquake straps', 'Check the anode rod (tank units)',
            'Written report after each visit'] }
        ]},
        { title: 'Member perks', prices: true, fields: [
          { id: 'perk_priority', type: 'static', items: ['Priority scheduling'] },
          { id: 'repair_discount', label: '% off repairs', type: 'percent', half: true },
          { id: 'perk_trip', type: 'static', items: ['No trip fee on repair calls'] }
        ]},
        { title: 'The fine print', fields: [
          { id: 'fine', type: 'note', text: 'Renews every year. We remind you before it does. Cancel anytime by call or text. No fee.' }
        ]},
        { title: 'How you pay', fields: [
          { id: 'pay_method', label: 'Payment', type: 'choice', options: ['Cash', 'Check', 'Card'] },
          { id: 'pay_when', label: 'When', type: 'choice', options: ['Pay each visit', 'Pay for the year up front'] }
        ]}
      ]
    },

    {
      id: 'estimate', pack: 'plumbing', icon: 'clipboard',
      title: 'Estimate', short: 'Estimate',
      blurb: 'Give them options. They sign to OK one.',
      sections: [
        { title: "What's going on", fields: [
          { id: 'problem', label: 'What we found', type: 'textarea' }
        ]},
        { title: 'Your options', prices: true, fields: [
          { id: 'options', type: 'options', label: 'Options', names: ['Good', 'Better', 'Best'] },
          { id: 'valid_days', label: 'Price good for (days)', type: 'number', half: true }
        ]},
        { title: 'Your pick', fields: [
          { id: 'picked', label: 'Option picked', type: 'choice', options: ['Good', 'Better', 'Best', 'Not yet'] },
          { id: 'deposit', label: 'Deposit today', type: 'money', half: true }
        ]}
      ]
    },

    {
      id: 'invoice', pack: 'plumbing', icon: 'receipt',
      title: 'Invoice', short: 'Invoice',
      blurb: 'What we did and what it costs.',
      sections: [
        { title: 'The job', fields: [
          { id: 'invoice_no', label: 'Invoice #', type: 'text', half: true, auto: 'invoice' },
          { id: 'work_done', label: 'Work done', type: 'textarea' }
        ]},
        { title: 'Charges', prices: true, fields: [
          { id: 'lines', type: 'lineitems', label: 'Charges' },
          { id: 'tax', label: 'Tax %', type: 'percent', half: true }
        ]},
        { title: 'Payment', fields: [
          { id: 'pay_status', label: 'Status', type: 'choice', options: ['Paid today', 'Due'] },
          { id: 'pay_method', label: 'Paid by', type: 'choice', options: ['Cash', 'Check', 'Card', 'Other'] },
          { id: 'due_date', label: 'Due by', type: 'date', half: true }
        ]}
      ]
    },

    {
      id: 'signoff', pack: 'plumbing', icon: 'check',
      title: 'Job Completion Sign-Off', short: 'Job sign-off',
      blurb: 'Customer signs that the job is done right.',
      sections: [
        { title: 'The job', fields: [
          { id: 'work_done', label: 'Work done', type: 'textarea' }
        ]},
        { title: 'Before we left', fields: [
          { id: 'checks', type: 'multi', label: 'Checked', options: [
            'Tested, no leaks', 'Water and gas back on', 'Work area cleaned up',
            'Old parts hauled off', 'Walked the customer through the work'] }
        ]},
        { title: 'Notes and photos', fields: [
          { id: 'notes', label: 'Notes', type: 'textarea' },
          { id: 'photos', label: 'Photos', type: 'photos', max: 4 }
        ]},
        { title: 'Customer OK', fields: [
          { id: 'happy', label: 'Happy with the work?', type: 'choice', options: ['Yes', 'Not yet, see notes'] }
        ]}
      ]
    },

    {
      id: 'warranty', pack: 'plumbing', icon: 'shield',
      title: 'Warranty Card', short: 'Warranty',
      blurb: "What's covered and for how long.",
      sections: [
        { title: "What we're covering", fields: [
          { id: 'work_covered', label: 'Work covered', type: 'textarea' },
          { id: 'equip', label: 'Equipment brand and model', type: 'text' },
          { id: 'serial', label: 'Serial #', type: 'text', half: true },
          { id: 'finish_date', label: 'Work finished on', type: 'date', half: true }
        ]},
        { title: 'How long', fields: [
          { id: 'labor_years', label: 'Labor warranty', type: 'text', half: true, placeholder: 'like 1 year' },
          { id: 'parts_years', label: 'Parts warranty', type: 'text', half: true, placeholder: 'like 6 years' }
        ]},
        { title: 'Good to know', fields: [
          { id: 'warranty_note', type: 'note', text: "Not covered: damage from freezing, flooding, or work by someone else. Something wrong? Call or text us and have this card handy." }
        ]}
      ]
    },

    {
      id: 'inspection', pack: 'plumbing', icon: 'search',
      title: 'Plumbing Inspection Report', short: 'Inspection',
      blurb: 'Walk the house, rate each spot, add photos.',
      sections: [
        { title: 'What we checked', fields: [
          { id: 'inspect', type: 'inspect', label: 'Checked', items: [
            'Water heater', 'Water pressure', 'Main shutoff', 'Toilets', 'Sinks and faucets',
            'Drains', 'Outdoor hose bibs', 'Sewer cleanout', 'Gas line', 'Visible leaks'] }
        ]},
        { title: 'What we recommend', fields: [
          { id: 'recs', label: 'Recommendations', type: 'textarea' },
          { id: 'photos', label: 'Photos', type: 'photos', max: 4 }
        ]}
      ]
    }
  ]
};
