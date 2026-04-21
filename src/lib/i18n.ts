export type Language = 'es' | 'en' | 'pt'

export interface Translations {
  nav: {
    home: string
    services: string
    tracking: string
    about: string
    caseStudies: string
    coverage: string
    faq: string
    contact: string
    admin: string
    quote: string
    clientPortal: string
  }
  hero: {
    title: string
    subtitle: string
    quoteButton: string
    contactButton: string
    speed: string
    speedDesc: string
    transparency: string
    transparencyDesc: string
    efficiency: string
    efficiencyDesc: string
  }
  services: {
    title: string
    subtitle: string
    maritime: string
    maritimeDesc: string
    maritimeDetails: string[]
    land: string
    landDesc: string
    landDetails: string[]
    air: string
    airDesc: string
    airDetails: string[]
    local: string
    localDesc: string
    localDetails: string[]
    consulting: string
    consultingDesc: string
    consultingDetails: string[]
    special: string
    specialDesc: string
    specialDetails: string[]
  }
  auth: {
    adminInvalid: string
    partnerInvalid: string
    loginSuccess: string
    connectionError: string
    verifying: string
    sending: string
    login: string
    enterEmail: string
    waitCountdown: string
    codeSent: string
    newCodeSent: string
    otpSendError: string
    otpProcessError: string
    otpIncorrect: string
    otpVerifyError: string
    welcome: string
  }
  tracking: {
    title: string
    subtitle: string
    placeholder: string
    search: string
    noResults: string
    status: string
    eta: string
    freeDays: string
    urgent: string
    expired: string
  }
  quote: {
    title: string
    subtitle: string
    name: string
    email: string
    phone: string
    cargoType: string
    origin: string
    destination: string
    details: string
    submit: string
    submitting: string
    success: string
    error: string
    select: string
    maritime: string
    land: string
    air: string
    multimodal: string
    cityCountry: string
    detailsPlaceholder: string
    validationError: string
  }
  testimonials: {
    title: string
    subtitle: string
  }
  faq: {
    title: string
    subtitle: string
    contactNote: string
  }
  cta: {
    title: string
    subtitle: string
    onlineQuote: string
  }
  footerNav: {
    maritimeFreight: string
    landFreight: string
    airFreight: string
    company: string
    location: string
    terms: string
    privacy: string
    slogan2: string
  }
  footer: {
    slogan: string
    rights: string
  }
  common: {
    loading: string
    yes: string
    no: string
    save: string
    cancel: string
    delete: string
    edit: string
    close: string
    download: string
    upload: string
  }
  clientPortal: {
    title: string
    login: string
    logout: string
    myShipments: string
    activeShipments: string
    history: string
    documents: string
    uploadDocument: string
    downloadDocument: string
    noShipments: string
    email: string
    password: string
    loginButton: string
    forgotPassword: string
  }
  dashboard: {
    title: string
    stats: string
    quotes: string
    shipments: string
    analytics: string
    exportPDF: string
    exportExcel: string
    totalShipments: string
    urgentShipments: string
    overdueShipments: string
    shipmentsPerMonth: string
    topClients: string
    averageTransit: string
    byTransportMode: string
    byOrigin: string
    byDestination: string
    quoteStatus: string
    pending: string
    responded: string
    won: string
    lost: string
    addNote: string
    notes: string
    conversionRate: string
  }
  facts: {
    title: string
    fact1: string
    fact2: string
    fact3: string
    fact4: string
    fact5: string
  }
}

export const translations: Record<Language, Translations> = {
  es: {
    nav: {
      home: 'Inicio',
      services: 'Servicios',
      tracking: 'Tracking',
      about: 'Nosotros',
      caseStudies: 'Casos de Éxito',
      coverage: 'Cobertura',
      faq: 'FAQ',
      contact: 'Contacto',
      admin: 'Admin',
      quote: 'Cotizar',
      clientPortal: 'Portal Cliente'
    },
    hero: {
      title: 'Transit World Forwarding - Soluciones Logísticas Globales a Tu Medida',
      subtitle: 'Flete marítimo, terrestre y aéreo desde Uruguay al mundo con tracking en tiempo real',
      quoteButton: 'Cotizá tu Carga Gratis',
      contactButton: 'Contactar Ahora',
      speed: 'Rapidez',
      speedDesc: 'Operaciones ágiles y tiempos optimizados',
      transparency: 'Transparencia',
      transparencyDesc: 'Seguimiento en tiempo real de cada carga',
      efficiency: 'Eficiencia',
      efficiencyDesc: 'Rutas optimizadas al mejor costo'
    },
    services: {
      title: 'Nuestros Servicios de Logística Internacional',
      subtitle: 'Flete marítimo, terrestre y aéreo con seguimiento 24/7 y atención personalizada',
      maritime: 'Flete Marítimo Internacional',
      maritimeDesc: 'FCL y LCL desde y hacia todo el mundo',
      maritimeDetails: [
        'Importación y exportación global',
        'Coordinación con MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidado y desconsolidado en depósitos fiscalizados',
        'Gestión completa de documentación'
      ],
      land: 'Flete Terrestre Internacional',
      landDesc: 'Transporte regional puerta a puerta',
      landDetails: [
        'Transporte desde/hacia Brasil, Argentina, Paraguay y Chile',
        'Coordinación puerta a puerta',
        'Seguimiento en tiempo real',
        'Gestión documental completa'
      ],
      air: 'Flete Aéreo Internacional',
      airDesc: 'Servicio express para cargas urgentes',
      airDetails: [
        'Importación/exportación express',
        'Coordinación con principales aerolíneas',
        'Ideal para cargas urgentes o alto valor',
        'Tiempos de tránsito reducidos'
      ],
      local: 'Operativas Locales',
      localDesc: 'Desconsolidación y entregas directas',
      localDetails: [
        'Trasiegos y desconsolidaciones',
        'Entregas directas',
        'Coordinación con Montecon, TCP',
        'Gestión de liberaciones y tasas portuarias'
      ],
      consulting: 'Asesoramiento Logístico',
      consultingDesc: 'Planificación y optimización integral',
      consultingDetails: [
        'Planificación de rutas, tiempos y costos',
        'Asistencia aduanera y documentación',
        'Optimización de embarques',
        'Consultoría personalizada'
      ],
      special: 'Cargas Especiales e IMO',
      specialDesc: 'Transporte certificado de cargas peligrosas',
      specialDetails: [
        'Coordinación segura y certificada',
        'Cargas peligrosas o sobredimensionadas',
        'Seguimiento detallado',
        'Cumplimiento normativo total'
      ]
    },
    tracking: {
      title: 'Tracking de Contenedores en Tiempo Real',
      subtitle: 'Ingrese el número de contenedor o referencia para rastrear su envío desde origen hasta destino',
      placeholder: 'Número de contenedor o REF',
      search: 'Buscar',
      noResults: 'No se encontraron resultados',
      status: 'Estado',
      eta: 'ETA',
      freeDays: 'Días libres',
      urgent: 'Urgente',
      expired: 'Vencido'
    },
    quote: {
      title: 'Cotizá tu Flete Internacional Gratis',
      subtitle: 'Completá el formulario y recibí tu cotización en menos de 24 horas',
      name: 'Nombre / Empresa',
      email: 'Email',
      phone: 'WhatsApp / Teléfono',
      cargoType: 'Tipo de Carga',
      origin: 'Origen',
      destination: 'Destino',
      details: 'Detalle de la Carga',
      submit: 'Enviar Cotización',
      submitting: 'Enviando...',
      success: '¡Cotización enviada exitosamente! Nos contactaremos pronto.',
      error: 'Hubo un error al enviar la cotización. Por favor intente nuevamente o contáctenos por WhatsApp.',
      select: 'Seleccionar...',
      maritime: 'Marítima (FCL/LCL)',
      land: 'Terrestre',
      air: 'Aérea',
      multimodal: 'Multimodal',
      cityCountry: 'Ciudad, País',
      detailsPlaceholder: 'Tipo de mercadería, peso aproximado, dimensiones, etc.',
      validationError: 'Por favor complete los campos requeridos'
    },
    testimonials: {
      title: 'Lo que dicen nuestros clientes',
      subtitle: 'Empresas que eligen TWF para mover su carga al mundo'
    },
    faq: {
      title: 'Preguntas Frecuentes',
      subtitle: 'Respuestas a las consultas más comunes sobre nuestros servicios',
      contactNote: 'Respondemos consultas en menos de 24 horas por WhatsApp, email o teléfono'
    },
    cta: {
      title: '¿Listo para mover tu carga?',
      subtitle: 'Cotizá en minutos. Respuesta inmediata por WhatsApp.',
      onlineQuote: 'Cotizar Online'
    },
    footerNav: {
      maritimeFreight: 'Flete Marítimo',
      landFreight: 'Flete Terrestre',
      airFreight: 'Flete Aéreo',
      company: 'Empresa',
      location: 'Ubicación',
      terms: 'Términos y Condiciones',
      privacy: 'Política de Privacidad',
      slogan2: 'Soluciones logísticas globales con atención local'
    },
    footer: {
      slogan: 'Movemos tu negocio al mundo',
      rights: 'Todos los derechos reservados.'
    },
    common: {
      loading: 'Cargando...',
      yes: 'Sí',
      no: 'No',
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      close: 'Cerrar',
      download: 'Descargar',
      upload: 'Subir'
    },
    clientPortal: {
      title: 'Portal de Cliente',
      login: 'Iniciar Sesión',
      logout: 'Cerrar Sesión',
      myShipments: 'Mis Cargas',
      activeShipments: 'Cargas Activas',
      history: 'Historial',
      documents: 'Documentos',
      uploadDocument: 'Subir Documento',
      downloadDocument: 'Descargar',
      noShipments: 'No hay cargas para mostrar',
      email: 'Email',
      password: 'Contraseña',
      loginButton: 'Ingresar',
      forgotPassword: '¿Olvidaste tu contraseña?'
    },
    dashboard: {
      title: 'Panel de Administración',
      stats: 'Estadísticas',
      quotes: 'Cotizaciones',
      shipments: 'Cargas',
      analytics: 'Analíticas',
      exportPDF: 'Exportar PDF',
      exportExcel: 'Exportar Excel',
      totalShipments: 'Total Cargas',
      urgentShipments: 'Urgentes',
      overdueShipments: 'Vencidas',
      shipmentsPerMonth: 'Cargas por Mes',
      topClients: 'Top 5 Clientes',
      averageTransit: 'Tiempo Promedio de Tránsito',
      byTransportMode: 'Por Modo de Transporte',
      byOrigin: 'Por País de Origen',
      byDestination: 'Por País de Destino',
      quoteStatus: 'Estado de Cotización',
      pending: 'Pendiente',
      responded: 'Respondida',
      won: 'Ganada',
      lost: 'Perdida',
      addNote: 'Agregar Nota',
      notes: 'Notas',
      conversionRate: 'Tasa de Conversión'
    },
    facts: {
      title: '¿Sabías que?',
      fact1: 'El 90% del comercio mundial se realiza por vía marítima',
      fact2: 'Un contenedor de 40 pies puede transportar hasta 10.000 cajas de vino',
      fact3: 'El flete aéreo puede reducir hasta 15 días el tiempo de tránsito comparado con el marítimo',
      fact4: 'La consolidación de carga puede reducir costos hasta un 60% en fletes internacionales',
      fact5: 'Los tiempos de tránsito marítimo típicos: Asia 35-45 días, Europa 25-35 días, EEUU 20-30 días'
    },
    auth: {
      adminInvalid: 'Usuario o contraseña incorrectos',
      partnerInvalid: 'Credenciales incorrectas',
      loginSuccess: 'Inicio de sesión exitoso',
      connectionError: 'Error de conexión — intentá nuevamente',
      verifying: 'Verificando...',
      sending: 'Enviando...',
      login: 'Ingresar',
      enterEmail: 'Ingresá tu email',
      waitCountdown: 'Esperá {s}s para reenviar',
      codeSent: 'Código enviado a {email}',
      newCodeSent: 'Nuevo código enviado',
      otpSendError: 'Error al enviar el código',
      otpProcessError: 'Error al procesar la solicitud',
      otpIncorrect: 'Código incorrecto',
      otpVerifyError: 'Error al verificar el código',
      welcome: 'Bienvenido/a'
    }
  },
  en: {
    nav: {
      home: 'Home',
      services: 'Services',
      tracking: 'Tracking',
      about: 'About Us',
      caseStudies: 'Success Stories',
      coverage: 'Coverage',
      faq: 'FAQ',
      contact: 'Contact',
      admin: 'Admin',
      quote: 'Quote',
      clientPortal: 'Client Portal'
    },
    hero: {
      title: 'Transit World Forwarding - Global Logistics Solutions Tailored to You',
      subtitle: 'Ocean, land, and air freight from Uruguay worldwide with real-time tracking',
      quoteButton: 'Get a Free Quote',
      contactButton: 'Contact Now',
      speed: 'Speed',
      speedDesc: 'Agile operations and optimized times',
      transparency: 'Transparency',
      transparencyDesc: 'Real-time tracking for every shipment',
      efficiency: 'Efficiency',
      efficiencyDesc: 'Optimized routes at the best cost'
    },
    services: {
      title: 'Our International Logistics Services',
      subtitle: 'Ocean, land, and air freight with 24/7 tracking and personalized support',
      maritime: 'International Maritime Freight',
      maritimeDesc: 'FCL and LCL worldwide',
      maritimeDetails: [
        'Global import and export',
        'Coordination with MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidation and deconsolidation in bonded warehouses',
        'Full documentation management'
      ],
      land: 'International Land Freight',
      landDesc: 'Regional door-to-door transport',
      landDetails: [
        'Transport to/from Brazil, Argentina, Paraguay and Chile',
        'Door-to-door coordination',
        'Real-time tracking',
        'Full documentation management'
      ],
      air: 'International Air Freight',
      airDesc: 'Express service for urgent cargo',
      airDetails: [
        'Express import/export',
        'Coordination with major airlines',
        'Ideal for urgent or high-value cargo',
        'Reduced transit times'
      ],
      local: 'Local Operations',
      localDesc: 'Deconsolidation and direct deliveries',
      localDetails: [
        'Transfers and deconsolidations',
        'Direct deliveries',
        'Coordination with Montecon, TCP',
        'Release management and port fees'
      ],
      consulting: 'Logistics Consulting',
      consultingDesc: 'Comprehensive planning and optimization',
      consultingDetails: [
        'Route, timing and cost planning',
        'Customs assistance and documentation',
        'Shipment optimization',
        'Personalized consulting'
      ],
      special: 'Special Cargo and IMO',
      specialDesc: 'Certified transport of dangerous goods',
      specialDetails: [
        'Safe and certified coordination',
        'Dangerous or oversized cargo',
        'Detailed tracking',
        'Full regulatory compliance'
      ]
    },
    tracking: {
      title: 'Real-Time Container Tracking',
      subtitle: 'Enter container number or reference to track your shipment from origin to destination',
      placeholder: 'Container number or REF',
      search: 'Search',
      noResults: 'No results found',
      status: 'Status',
      eta: 'ETA',
      freeDays: 'Free days',
      urgent: 'Urgent',
      expired: 'Expired'
    },
    quote: {
      title: 'Get Your Free International Freight Quote',
      subtitle: 'Fill out the form and receive your quote within 24 hours',
      name: 'Name / Company',
      email: 'Email',
      phone: 'WhatsApp / Phone',
      cargoType: 'Cargo Type',
      origin: 'Origin',
      destination: 'Destination',
      details: 'Cargo Details',
      submit: 'Send Quote',
      submitting: 'Sending...',
      success: 'Quote sent successfully! We will contact you soon.',
      error: 'There was an error sending the quote. Please try again or contact us via WhatsApp.',
      select: 'Select...',
      maritime: 'Maritime (FCL/LCL)',
      land: 'Land',
      air: 'Air',
      multimodal: 'Multimodal',
      cityCountry: 'City, Country',
      detailsPlaceholder: 'Type of goods, approximate weight, dimensions, etc.',
      validationError: 'Please fill in the required fields'
    },
    testimonials: {
      title: 'What our clients say',
      subtitle: 'Companies that choose TWF to move their cargo worldwide'
    },
    faq: {
      title: 'Frequently Asked Questions',
      subtitle: 'Answers to the most common questions about our services',
      contactNote: 'We respond to inquiries within 24 hours via WhatsApp, email, or phone'
    },
    cta: {
      title: 'Ready to move your cargo?',
      subtitle: 'Get a quote in minutes. Instant WhatsApp response.',
      onlineQuote: 'Online Quote'
    },
    footerNav: {
      maritimeFreight: 'Maritime Freight',
      landFreight: 'Land Freight',
      airFreight: 'Air Freight',
      company: 'Company',
      location: 'Location',
      terms: 'Terms & Conditions',
      privacy: 'Privacy Policy',
      slogan2: 'Global logistics solutions with local attention'
    },
    footer: {
      slogan: 'Moving your business to the world',
      rights: 'All rights reserved.'
    },
    common: {
      loading: 'Loading...',
      yes: 'Yes',
      no: 'No',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      download: 'Download',
      upload: 'Upload'
    },
    clientPortal: {
      title: 'Client Portal',
      login: 'Login',
      logout: 'Logout',
      myShipments: 'My Shipments',
      activeShipments: 'Active Shipments',
      history: 'History',
      documents: 'Documents',
      uploadDocument: 'Upload Document',
      downloadDocument: 'Download',
      noShipments: 'No shipments to display',
      email: 'Email',
      password: 'Password',
      loginButton: 'Sign In',
      forgotPassword: 'Forgot password?'
    },
    dashboard: {
      title: 'Admin Dashboard',
      stats: 'Statistics',
      quotes: 'Quotes',
      shipments: 'Shipments',
      analytics: 'Analytics',
      exportPDF: 'Export PDF',
      exportExcel: 'Export Excel',
      totalShipments: 'Total Shipments',
      urgentShipments: 'Urgent',
      overdueShipments: 'Overdue',
      shipmentsPerMonth: 'Shipments per Month',
      topClients: 'Top 5 Clients',
      averageTransit: 'Average Transit Time',
      byTransportMode: 'By Transport Mode',
      byOrigin: 'By Country of Origin',
      byDestination: 'By Country of Destination',
      quoteStatus: 'Quote Status',
      pending: 'Pending',
      responded: 'Responded',
      won: 'Won',
      lost: 'Lost',
      addNote: 'Add Note',
      notes: 'Notes',
      conversionRate: 'Conversion Rate'
    },
    facts: {
      title: 'Did you know?',
      fact1: '90% of global trade is carried by sea',
      fact2: 'A 40-foot container can transport up to 10,000 wine boxes',
      fact3: 'Air freight can reduce transit time by up to 15 days compared to maritime',
      fact4: 'Cargo consolidation can reduce costs by up to 60% in international freight',
      fact5: 'Typical maritime transit times: Asia 35-45 days, Europe 25-35 days, USA 20-30 days'
    },
    auth: {
      adminInvalid: 'Invalid username or password',
      partnerInvalid: 'Invalid credentials',
      loginSuccess: 'Signed in successfully',
      connectionError: 'Connection error — please try again',
      verifying: 'Verifying...',
      sending: 'Sending...',
      login: 'Sign in',
      enterEmail: 'Enter your email',
      waitCountdown: 'Wait {s}s before resending',
      codeSent: 'Code sent to {email}',
      newCodeSent: 'New code sent',
      otpSendError: 'Error sending the code',
      otpProcessError: 'Error processing the request',
      otpIncorrect: 'Incorrect code',
      otpVerifyError: 'Error verifying the code',
      welcome: 'Welcome'
    }
  },
  pt: {
    nav: {
      home: 'Início',
      services: 'Serviços',
      tracking: 'Rastreamento',
      about: 'Sobre Nós',
      caseStudies: 'Cases de Sucesso',
      coverage: 'Cobertura',
      faq: 'FAQ',
      contact: 'Contato',
      admin: 'Admin',
      quote: 'Cotação',
      clientPortal: 'Portal do Cliente'
    },
    hero: {
      title: 'Transit World Forwarding - Soluções Logísticas Globais Personalizadas',
      subtitle: 'Frete marítimo, terrestre e aéreo do Uruguai ao mundo com rastreamento em tempo real',
      quoteButton: 'Cotar sua Carga Grátis',
      contactButton: 'Contatar Agora',
      speed: 'Rapidez',
      speedDesc: 'Operações ágeis e tempos otimizados',
      transparency: 'Transparência',
      transparencyDesc: 'Rastreamento em tempo real de cada carga',
      efficiency: 'Eficiência',
      efficiencyDesc: 'Rotas otimizadas ao melhor custo'
    },
    services: {
      title: 'Nossos Serviços de Logística Internacional',
      subtitle: 'Frete marítimo, terrestre e aéreo com rastreamento 24/7 e atendimento personalizado',
      maritime: 'Frete Marítimo Internacional',
      maritimeDesc: 'FCL e LCL para todo o mundo',
      maritimeDetails: [
        'Importação e exportação global',
        'Coordenação com MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidação e desconsolidação em armazéns alfandegados',
        'Gestão completa de documentação'
      ],
      land: 'Frete Terrestre Internacional',
      landDesc: 'Transporte regional porta a porta',
      landDetails: [
        'Transporte de/para Brasil, Argentina, Paraguai e Chile',
        'Coordenação porta a porta',
        'Rastreamento em tempo real',
        'Gestão documental completa'
      ],
      air: 'Frete Aéreo Internacional',
      airDesc: 'Serviço expresso para cargas urgentes',
      airDetails: [
        'Importação/exportação expressa',
        'Coordenação com as principais companhias aéreas',
        'Ideal para cargas urgentes ou de alto valor',
        'Tempos de trânsito reduzidos'
      ],
      local: 'Operações Locais',
      localDesc: 'Desconsolidação e entregas diretas',
      localDetails: [
        'Transferências e desconsolidações',
        'Entregas diretas',
        'Coordenação com Montecon, TCP',
        'Gestão de liberações e taxas portuárias'
      ],
      consulting: 'Consultoria Logística',
      consultingDesc: 'Planejamento e otimização integral',
      consultingDetails: [
        'Planejamento de rotas, tempos e custos',
        'Assistência aduaneira e documentação',
        'Otimização de embarques',
        'Consultoria personalizada'
      ],
      special: 'Cargas Especiais e IMO',
      specialDesc: 'Transporte certificado de cargas perigosas',
      specialDetails: [
        'Coordenação segura e certificada',
        'Cargas perigosas ou sobredimensionadas',
        'Rastreamento detalhado',
        'Cumprimento regulatório total'
      ]
    },
    tracking: {
      title: 'Rastreamento de Contêineres em Tempo Real',
      subtitle: 'Digite o número do contêiner ou referência para rastrear seu envio da origem ao destino',
      placeholder: 'Número do contêiner ou REF',
      search: 'Buscar',
      noResults: 'Nenhum resultado encontrado',
      status: 'Status',
      eta: 'ETA',
      freeDays: 'Dias livres',
      urgent: 'Urgente',
      expired: 'Vencido'
    },
    quote: {
      title: 'Solicite sua Cotação de Frete Grátis',
      subtitle: 'Preencha o formulário e receba sua cotação em menos de 24 horas',
      name: 'Nome / Empresa',
      email: 'Email',
      phone: 'WhatsApp / Telefone',
      cargoType: 'Tipo de Carga',
      origin: 'Origem',
      destination: 'Destino',
      details: 'Detalhes da Carga',
      submit: 'Enviar Cotação',
      submitting: 'Enviando...',
      success: 'Cotação enviada com sucesso! Entraremos em contato em breve.',
      error: 'Houve um erro ao enviar a cotação. Por favor, tente novamente ou entre em contato via WhatsApp.',
      select: 'Selecionar...',
      maritime: 'Marítima (FCL/LCL)',
      land: 'Terrestre',
      air: 'Aérea',
      multimodal: 'Multimodal',
      cityCountry: 'Cidade, País',
      detailsPlaceholder: 'Tipo de mercadoria, peso aproximado, dimensões, etc.',
      validationError: 'Por favor preencha os campos obrigatórios'
    },
    testimonials: {
      title: 'O que nossos clientes dizem',
      subtitle: 'Empresas que escolhem a TWF para mover sua carga pelo mundo'
    },
    faq: {
      title: 'Perguntas Frequentes',
      subtitle: 'Respostas às perguntas mais comuns sobre nossos serviços',
      contactNote: 'Respondemos consultas em menos de 24 horas por WhatsApp, email ou telefone'
    },
    cta: {
      title: 'Pronto para mover sua carga?',
      subtitle: 'Cotação em minutos. Resposta imediata pelo WhatsApp.',
      onlineQuote: 'Cotação Online'
    },
    footerNav: {
      maritimeFreight: 'Frete Marítimo',
      landFreight: 'Frete Terrestre',
      airFreight: 'Frete Aéreo',
      company: 'Empresa',
      location: 'Localização',
      terms: 'Termos e Condições',
      privacy: 'Política de Privacidade',
      slogan2: 'Soluções logísticas globais com atenção local'
    },
    footer: {
      slogan: 'Movemos seu negócio para o mundo',
      rights: 'Todos os direitos reservados.'
    },
    common: {
      loading: 'Carregando...',
      yes: 'Sim',
      no: 'Não',
      save: 'Salvar',
      cancel: 'Cancelar',
      delete: 'Excluir',
      edit: 'Editar',
      close: 'Fechar',
      download: 'Baixar',
      upload: 'Enviar'
    },
    clientPortal: {
      title: 'Portal do Cliente',
      login: 'Entrar',
      logout: 'Sair',
      myShipments: 'Minhas Cargas',
      activeShipments: 'Cargas Ativas',
      history: 'Histórico',
      documents: 'Documentos',
      uploadDocument: 'Enviar Documento',
      downloadDocument: 'Baixar',
      noShipments: 'Nenhuma carga para exibir',
      email: 'Email',
      password: 'Senha',
      loginButton: 'Entrar',
      forgotPassword: 'Esqueceu a senha?'
    },
    dashboard: {
      title: 'Painel Administrativo',
      stats: 'Estatísticas',
      quotes: 'Cotações',
      shipments: 'Cargas',
      analytics: 'Análises',
      exportPDF: 'Exportar PDF',
      exportExcel: 'Exportar Excel',
      totalShipments: 'Total de Cargas',
      urgentShipments: 'Urgentes',
      overdueShipments: 'Vencidas',
      shipmentsPerMonth: 'Cargas por Mês',
      topClients: 'Top 5 Clientes',
      averageTransit: 'Tempo Médio de Trânsito',
      byTransportMode: 'Por Modo de Transporte',
      byOrigin: 'Por País de Origem',
      byDestination: 'Por País de Destino',
      quoteStatus: 'Status da Cotação',
      pending: 'Pendente',
      responded: 'Respondida',
      won: 'Ganha',
      lost: 'Perdida',
      addNote: 'Adicionar Nota',
      notes: 'Notas',
      conversionRate: 'Taxa de Conversão'
    },
    facts: {
      title: 'Você sabia?',
      fact1: '90% do comércio mundial é realizado por via marítima',
      fact2: 'Um contêiner de 40 pés pode transportar até 10.000 caixas de vinho',
      fact3: 'O frete aéreo pode reduzir até 15 dias o tempo de trânsito comparado ao marítimo',
      fact4: 'A consolidação de carga pode reduzir custos em até 60% em fretes internacionais',
      fact5: 'Tempos típicos de trânsito marítimo: Ásia 35-45 dias, Europa 25-35 dias, EUA 20-30 dias'
    },
    auth: {
      adminInvalid: 'Usuário ou senha incorretos',
      partnerInvalid: 'Credenciais incorretas',
      loginSuccess: 'Login realizado com sucesso',
      connectionError: 'Erro de conexão — tente novamente',
      verifying: 'Verificando...',
      sending: 'Enviando...',
      login: 'Entrar',
      enterEmail: 'Digite seu email',
      waitCountdown: 'Aguarde {s}s para reenviar',
      codeSent: 'Código enviado para {email}',
      newCodeSent: 'Novo código enviado',
      otpSendError: 'Erro ao enviar o código',
      otpProcessError: 'Erro ao processar a solicitação',
      otpIncorrect: 'Código incorreto',
      otpVerifyError: 'Erro ao verificar o código',
      welcome: 'Bem-vindo(a)'
    }
  }
}

export function useTranslation(lang: Language = 'es'): Translations {
  return translations[lang] || translations.es
}

const LANGUAGE_STORAGE_KEY = 'twf-language'

export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'es'
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'es' || stored === 'en' || stored === 'pt') return stored
  } catch {}
  return 'es'
}

export function setStoredLanguage(lang: Language): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, lang) } catch {}
}
