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
    land: string
    landDesc: string
    air: string
    airDesc: string
    local: string
    localDesc: string
    consulting: string
    consultingDesc: string
    special: string
    specialDesc: string
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
      quote: 'Solicitar Cotización',
      clientPortal: 'Portal Cliente'
    },
    hero: {
      title: 'Transit World Forwarding - Soluciones Logísticas Globales a Tu Medida',
      subtitle: 'Transit World Forwarding – Tu socio estratégico en comercio internacional',
      quoteButton: 'Solicitar Cotización',
      contactButton: 'Contactar Ahora',
      speed: 'Rapidez',
      speedDesc: 'Operaciones ágiles y tiempos optimizados',
      transparency: 'Transparencia',
      transparencyDesc: 'Comunicación clara en cada etapa',
      efficiency: 'Eficiencia',
      efficiencyDesc: 'Soluciones inteligentes y efectivas'
    },
    services: {
      title: 'Nuestros Servicios de Logística Internacional',
      subtitle: 'Soluciones integrales de transporte internacional para conectar tu negocio con el mundo',
      maritime: 'Flete Marítimo Internacional',
      maritimeDesc: 'FCL y LCL desde y hacia todo el mundo',
      land: 'Flete Terrestre Internacional',
      landDesc: 'Transporte regional puerta a puerta',
      air: 'Flete Aéreo Internacional',
      airDesc: 'Servicio express para cargas urgentes',
      local: 'Operativas Locales',
      localDesc: 'Desconsolidación y entregas directas',
      consulting: 'Asesoramiento Logístico',
      consultingDesc: 'Planificación y optimización integral',
      special: 'Cargas Especiales e IMO',
      specialDesc: 'Transporte certificado de cargas peligrosas'
    },
    tracking: {
      title: 'Tracking de Contenedores en Tiempo Real',
      subtitle: 'Ingrese el número de contenedor o referencia para conocer el estado de su carga en tiempo real',
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
      title: 'Solicitar Cotización de Flete Internacional',
      subtitle: 'Completa el formulario y te responderemos a la brevedad con la mejor solución para tu carga',
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
      error: 'Hubo un error al enviar la cotización. Por favor intente nuevamente o contáctenos por WhatsApp.'
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
      quote: 'Request Quote',
      clientPortal: 'Client Portal'
    },
    hero: {
      title: 'Transit World Forwarding - Global Logistics Solutions Tailored to You',
      subtitle: 'Transit World Forwarding – Your strategic partner in international trade',
      quoteButton: 'Request Quote',
      contactButton: 'Contact Now',
      speed: 'Speed',
      speedDesc: 'Agile operations and optimized times',
      transparency: 'Transparency',
      transparencyDesc: 'Clear communication at every stage',
      efficiency: 'Efficiency',
      efficiencyDesc: 'Smart and effective solutions'
    },
    services: {
      title: 'Our International Logistics Services',
      subtitle: 'Comprehensive international transport solutions to connect your business with the world',
      maritime: 'International Maritime Freight',
      maritimeDesc: 'FCL and LCL worldwide',
      land: 'International Land Freight',
      landDesc: 'Regional door-to-door transport',
      air: 'International Air Freight',
      airDesc: 'Express service for urgent cargo',
      local: 'Local Operations',
      localDesc: 'Deconsolidation and direct deliveries',
      consulting: 'Logistics Consulting',
      consultingDesc: 'Comprehensive planning and optimization',
      special: 'Special Cargo and IMO',
      specialDesc: 'Certified transport of dangerous goods'
    },
    tracking: {
      title: 'Real-Time Container Tracking',
      subtitle: 'Enter container number or reference to know your cargo status in real time',
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
      title: 'Request International Freight Quote',
      subtitle: 'Complete the form and we will respond shortly with the best solution for your cargo',
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
      error: 'There was an error sending the quote. Please try again or contact us via WhatsApp.'
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
      quote: 'Solicitar Cotação',
      clientPortal: 'Portal do Cliente'
    },
    hero: {
      title: 'Transit World Forwarding - Soluções Logísticas Globais Personalizadas',
      subtitle: 'Transit World Forwarding – Seu parceiro estratégico em comércio internacional',
      quoteButton: 'Solicitar Cotação',
      contactButton: 'Contatar Agora',
      speed: 'Rapidez',
      speedDesc: 'Operações ágeis e tempos otimizados',
      transparency: 'Transparência',
      transparencyDesc: 'Comunicação clara em cada etapa',
      efficiency: 'Eficiência',
      efficiencyDesc: 'Soluções inteligentes e eficazes'
    },
    services: {
      title: 'Nossos Serviços de Logística Internacional',
      subtitle: 'Soluções integrais de transporte internacional para conectar seu negócio com o mundo',
      maritime: 'Frete Marítimo Internacional',
      maritimeDesc: 'FCL e LCL para todo o mundo',
      land: 'Frete Terrestre Internacional',
      landDesc: 'Transporte regional porta a porta',
      air: 'Frete Aéreo Internacional',
      airDesc: 'Serviço expresso para cargas urgentes',
      local: 'Operações Locais',
      localDesc: 'Desconsolidação e entregas diretas',
      consulting: 'Consultoria Logística',
      consultingDesc: 'Planejamento e otimização integral',
      special: 'Cargas Especiais e IMO',
      specialDesc: 'Transporte certificado de cargas perigosas'
    },
    tracking: {
      title: 'Rastreamento de Contêineres em Tempo Real',
      subtitle: 'Digite o número do contêiner ou referência para conhecer o status de sua carga em tempo real',
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
      title: 'Solicitar Cotação de Frete Internacional',
      subtitle: 'Preencha o formulário e responderemos em breve com a melhor solução para sua carga',
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
      error: 'Houve um erro ao enviar a cotação. Por favor, tente novamente ou entre em contato via WhatsApp.'
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
    }
  }
}

export function useTranslation(lang: Language = 'es'): Translations {
  return translations[lang] || translations.es
}
