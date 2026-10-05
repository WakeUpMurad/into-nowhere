export type Locale = 'ru' | 'en' | 'az';

export type Intention = 'wealth' | 'health' | 'success' | 'love' | 'gratitude';

export const commerceTranslations = {
  ru: {
    loading: 'Подготавливаем оплату TON…',
    checkoutUnavailable: 'Не удалось загрузить оплату. Если ты уже отправил TON, свяжись с поддержкой перед повторным переводом.', retry: 'Загрузить ещё раз',
    amountLabel: 'Сумма от {min} · ориентир в USD', amountAria: 'Сумма в {currency}',
    amountNote: 'Перед переводом увидишь точную сумму в TON.',
    supportCopy: '25% каждого полученного перевода до комиссий — на прямую помощь людям.',
    helpCopy: '«В никуда» — название ритуала. Получатель — коммерческий сервис Into Nowhere. 25% каждого полученного перевода до комиссий выделяются на прямую помощь нуждающимся; остальные 75% — доход сервиса и его расходы. При оплате TON доля помощи учитывается в TON. Подтверждения помощи публикуются после её оказания, личные истории — только с согласия получателей. Отчётов об оказанной помощи пока нет.',
    helpNote: 'Оплата — за символический ритуал и поддержку сервиса. Пожелание остаётся личным намерением: успех, деньги, любовь или здоровье не гарантируются. Доллары показывают ориентир; перевод и возможный возврат происходят в TON. Сетевую комиссию кошелёк показывает отдельно.',
    legalLabel: 'Информация о сервисе', terms: 'Оплата и возвраты', privacy: 'Конфиденциальность', contact: 'Связаться',
  },
  en: {
    loading: 'Preparing TON payments…',
    checkoutUnavailable: 'Payment could not be loaded. If you already sent TON, contact support before sending again.', retry: 'Load again',
    amountLabel: 'From {min} · USD reference', amountAria: 'Amount in {currency}',
    amountNote: 'You’ll see the exact TON amount before sending.',
    supportCopy: '25% of every received payment before fees goes towards direct help for people in need.',
    helpCopy: '“Into Nowhere” is the ritual’s name. The recipient is the commercial service Into Nowhere. We allocate 25% of every received payment, before fees, to direct help for people in need. The other 75% is service revenue and covers its costs. For TON payments, the help allocation is recorded in TON. Evidence is published after help is provided; personal stories are shared only with consent. No records of completed help have been published yet.',
    helpNote: 'Payment is for a symbolic experience and support for the service. Your wish is a personal intention, with no guarantee of wealth, success, love or health. USD is a reference; transfers and any refunds are in TON. Your wallet shows the network fee separately.',
    legalLabel: 'Service information', terms: 'Payments & refunds', privacy: 'Privacy', contact: 'Contact',
  },
  az: {
    loading: 'TON ödənişi hazırlanır…',
    checkoutUnavailable: 'Ödəniş yüklənə bilmədi. TON göndərmisənsə, yenidən göndərməzdən əvvəl dəstəyə müraciət et.', retry: 'Yenidən yüklə',
    amountLabel: '{min}-dan · USD üzrə istinad', amountAria: '{currency} ilə məbləğ',
    amountNote: 'Köçürmədən əvvəl dəqiq TON məbləğini görəcəksən.',
    supportCopy: 'Alınan hər ödənişin komissiyadan əvvəl 25%-i ehtiyacı olan insanlara birbaşa yardıma ayrılır.',
    helpCopy: '“Heçliyə” ritualın adıdır. Ödənişi Into Nowhere kommersiya xidməti alır. Alınan hər ödənişin komissiyadan əvvəl 25%-i ehtiyacı olan insanlara birbaşa yardıma ayrılır. Qalan 75% xidmətin gəliri və xərcləridir. TON ödənişlərində yardım payı TON ilə uçota alınır. Yardım göstərildikdən sonra təsdiqlər dərc edilir; şəxsi hekayələr yalnız razılıqla paylaşılır. Göstərilmiş yardım barədə hələ hesabat dərc edilməyib.',
    helpNote: 'Ödəniş simvolik təcrübə və xidmətə dəstək üçündür. Arzun şəxsi niyyət olaraq qalır; var-dövlət, uğur, sevgi və ya sağlamlığa zəmanət verilmir. USD istinad üçündür; köçürmələr və mümkün geri ödənişlər TON ilə edilir. Şəbəkə komissiyasını pulqabı ayrıca göstərir.',
    legalLabel: 'Xidmət haqqında məlumat', terms: 'Ödənişlər və geri qaytarma', privacy: 'Məxfilik', contact: 'Əlaqə',
  },
};

const words = {
  "ru": {
    "tagline": "Ритуал «В никуда»",
    "eyebrow": "Сохрани желание. Отпусти важность.",
    "heading": [
      "Отпустить.",
      "Поблагодарить.",
      "Пожелать."
    ],
    "description": "Выбери намерение и сумму, которую тебе комфортно отпустить.",
    "amountNote": "$1 — уже полноценный жест.",
    "intentionLabel": "Твоё намерение",
    "amountLabel": "Любая сумма от $1 · USD",
    "custom": "Своя сумма",
    "customAria": "Своя сумма в долларах",
    "paymentLabel": "Способ оплаты · демо",
    "card": "Карта",
    "demoAction": "Попробовать · {amount}",
    "holdNote": "Удержи на мгновение. Отпусти, когда захочешь.",
    "demo": "Пробный режим · деньги не списываются",
    "symbolic": "Символический жест",
    "mementoLabel": "Твой знак намерения",
    "supportLabel": "Твой жест имеет значение.",
    "supportCopy": "В модели проекта — прямая помощь нуждающимся с каждой оплаты.",
    "supportMobile": "на прямую помощь людям",
    "helpButton": "Куда идут деньги",
    "commercial": "Коммерческий сервис",
    "helpCopy": "«В никуда» — название ритуала. Деньги получает сервис. По плану 25% суммы каждой оплаты до комиссии направляются на прямую помощь нуждающимся. Остальные 75% — доход сервиса, из которого оплачиваются расходы. Подтверждения помощи будут публиковаться; личные истории — только с согласия получателей.",
    "helpNote": "Выбранное пожелание — личное намерение. Сумма не определяет его исполнение. Оплата пока не подключена.",
    "topicsLabel": "Моё пожелание",
    "appLabel": "Освобождение — личный ритуал",
    "canvasAria": "Световая фигура с эффектом глубины раскрывается при отпускании",
    "validation": "Укажи сумму от $1, например 1 или 2.50.",
    "amountPrompt": "Укажи сумму от $1",
    "ready": "Можно отпустить",
    "another": "Ещё одно намерение",
    "doneNote": "Спасибо. Ты сделал свой жест.",
    "holdingCaption": "Удели внимание своему пожеланию.",
    "holdingGratitude": "Вспомни, за что благодаришь.",
    "releaseCaption": "Сохрани намерение. Можно ослабить хватку.",
    "releaseGratitude": "Поблагодари и отпусти.",
    "completionCaption": "Ты выразил своё намерение.",
    "completionGratitude": "Спасибо за этот момент внимания.",
    "phases": {
      "idle": "Намерение",
      "holding": "Удержание",
      "releasing": "Отпускание",
      "done": "Завершение"
    },
    "musicEnable": "Включить музыку",
    "musicDisable": "Выключить музыку",
    "musicResume": "Музыка включится после касания.",
    "musicUnavailable": "Музыка здесь недоступна. Можно продолжить без неё.",
    "topics": {
      "wealth": {
        "name": "Богатство",
        "intention": "Хочу больше свободы в деньгах.",
        "caption": "Желать большего. Ослабить напряжение.",
        "outcome": "Можно желать достатка и относиться к деньгам спокойнее."
      },
      "health": {
        "name": "Здоровье",
        "intention": "Хочу бережнее относиться к себе.",
        "caption": "Удели внимание своему намерению.",
        "outcome": "Пусть это намерение станет поводом позаботиться о себе."
      },
      "success": {
        "name": "Успех",
        "intention": "Хочу смелее двигаться к своему.",
        "caption": "Сохрани цель. Отпусти лишнюю важность.",
        "outcome": "Твоё намерение может стать началом небольшого следующего шага."
      },
      "love": {
        "name": "Любовь",
        "intention": "Хочу больше тепла и близости.",
        "caption": "Сохрани открытость. Отпусти ожидания.",
        "outcome": "Тебе можно быть собой и оставаться открытым к другим."
      },
      "gratitude": {
        "name": "Благодарность",
        "intention": "Спасибо за то, что уже есть.",
        "caption": "Вспомни то, за что хочется сказать спасибо.",
        "outcome": "Можно ценить то, что есть, и желать большего."
      }
    },
    "brand": "Освобождение",
    "ritualName": "В никуда",
    "languageLabel": "Язык",
    "themeLabel": "Тема оформления",
    "themes": { "system": "Как на устройстве", "light": "Светлая", "dark": "Тёмная" },
    "doneLabel": "Жест сделан",
    "queryUnavailable": "Сервис оплаты пока недоступен. Можно попробовать демонстрацию без списания денег.",
    "musicError": "Не удалось включить музыку. Можно продолжить без неё.",
    "releaseEffect": "Свет раскрывается. Отпусти."
  },
  "en": {
    "tagline": "The “Into Nowhere” ritual",
    "eyebrow": "Keep your wish. Let go of the pressure.",
    "heading": [
      "Let go.",
      "Give thanks.",
      "Make a wish."
    ],
    "description": "Choose your intention and an amount you feel comfortable letting go of.",
    "amountNote": "$1 is a complete gesture.",
    "intentionLabel": "Your intention",
    "amountLabel": "Any amount from $1 · USD",
    "custom": "Your amount",
    "customAria": "Your amount in US dollars",
    "paymentLabel": "Payment method · demo",
    "card": "Card",
    "demoAction": "Try the gesture · {amount}",
    "holdNote": "Hold for a moment. Let go when you’re ready.",
    "demo": "Demo mode · no money is charged",
    "symbolic": "A symbolic gesture",
    "mementoLabel": "A symbol of your intention",
    "supportLabel": "Your gesture matters.",
    "supportCopy": "Our planned model includes direct help for people in need with every payment.",
    "supportMobile": "for direct help to people in need",
    "helpButton": "Where the money goes",
    "commercial": "A commercial service",
    "helpCopy": "“Into Nowhere” is the name of the ritual. The service receives the payment. We plan to put 25% of each payment, before fees, towards direct help for people in need. The remaining 75% is service revenue and covers its costs. Records of the help provided will be published; personal stories will only be shared with the recipients’ consent.",
    "helpNote": "Your wish is a personal intention, with no promise of fulfillment. The experience is the same whatever the amount. Payments are not enabled yet.",
    "topicsLabel": "My wish",
    "appLabel": "Release — a personal ritual",
    "canvasAria": "A figure of light responds to movement and opens as you let go",
    "validation": "Enter an amount of at least $1, for example 1 or 2.50.",
    "amountPrompt": "Enter at least $1",
    "ready": "You can let go",
    "another": "Another intention",
    "doneNote": "Thank you. You’ve made your gesture.",
    "holdingCaption": "Take a moment for your wish.",
    "holdingGratitude": "Remember what you’re grateful for.",
    "releaseCaption": "Keep your intention. Ease your grip.",
    "releaseGratitude": "Give thanks and let go.",
    "completionCaption": "You’ve expressed your intention.",
    "completionGratitude": "Thank you for this moment of attention.",
    "phases": {
      "idle": "Intention",
      "holding": "Holding",
      "releasing": "Letting go",
      "done": "Completion"
    },
    "musicEnable": "Turn on the music",
    "musicDisable": "Turn off the music",
    "musicResume": "Touch to resume the music.",
    "musicUnavailable": "Music isn’t available here. You can continue without it.",
    "topics": {
      "wealth": {
        "name": "Wealth",
        "intention": "I want more freedom with money.",
        "caption": "Wish for more. Ease your grip.",
        "outcome": "You can wish for abundance and feel more at ease with money."
      },
      "health": {
        "name": "Health",
        "intention": "I want to take better care of myself.",
        "caption": "Take a moment for your intention.",
        "outcome": "Let this intention be a reason to care for yourself."
      },
      "success": {
        "name": "Success",
        "intention": "I want to move towards my goals with more courage.",
        "caption": "Keep your goal. Let go of the pressure.",
        "outcome": "Your intention can be the start of a small next step."
      },
      "love": {
        "name": "Love",
        "intention": "I want more warmth and closeness.",
        "caption": "Stay open. Let go of expectations.",
        "outcome": "You can be yourself and stay open to others."
      },
      "gratitude": {
        "name": "Gratitude",
        "intention": "Thank you for what I already have.",
        "caption": "Remember something you’d like to say thank you for.",
        "outcome": "You can appreciate what you have and still wish for more."
      }
    },
    "brand": "Release",
    "ritualName": "Into Nowhere",
    "languageLabel": "Language",
    "themeLabel": "Appearance",
    "themes": { "system": "System", "light": "Light", "dark": "Dark" },
    "doneLabel": "The gesture is complete",
    "queryUnavailable": "Payments are currently unavailable. You can try the demo without being charged.",
    "musicError": "The music could not start. You can continue without it.",
    "releaseEffect": "The light opens. Let go."
  },
  "az": {
    "tagline": "«Heçliyə» ritualı",
    "eyebrow": "Arzunu saxla. Gərginliyi burax.",
    "heading": [
      "Burax.",
      "Təşəkkür et.",
      "Arzu et."
    ],
    "description": "Niyyətini və rahatlıqla buraxa biləcəyin məbləği seç.",
    "amountNote": "$1 də tam bir jestdir.",
    "intentionLabel": "Sənin niyyətin",
    "amountLabel": "Ən azı $1 · USD",
    "custom": "Öz məbləğin",
    "customAria": "ABŞ dolları ilə öz məbləğin",
    "paymentLabel": "Ödəniş üsulu · sınaq",
    "card": "Kart",
    "demoAction": "Jesti sına · {amount}",
    "holdNote": "Bir an basılı saxla. İstəyəndə burax.",
    "demo": "Sınaq rejimi · pul tutulmur",
    "symbolic": "Simvolik jest",
    "mementoLabel": "Niyyətinin işarəsi",
    "supportLabel": "Sənin jestin önəmlidir.",
    "supportCopy": "Layihənin planında hər ödənişdən ehtiyacı olan insanlara birbaşa yardım nəzərdə tutulur.",
    "supportMobile": "insanlara birbaşa yardım üçün",
    "helpButton": "Pul hara gedir",
    "commercial": "Kommersiya xidməti",
    "helpCopy": "«Heçliyə» ritualın adıdır. Ödənişi xidmət alır. Hər ödənişin komissiya tutulmamış məbləğinin 25%-ni ehtiyacı olan insanlara birbaşa yardım üçün ayırmağı planlaşdırırıq. Qalan 75% xidmətin gəliridir və xərcləri qarşılayır. Yardımın təsdiqləri dərc ediləcək; şəxsi hekayələr isə yalnız yardım alanların razılığı ilə paylaşılacaq.",
    "helpNote": "Seçdiyin arzu şəxsi niyyətdir; onun gerçəkləşməsi vəd edilmir. Məbləğindən asılı olmayaraq təcrübə eynidir. Ödəniş hələ aktiv deyil.",
    "topicsLabel": "Mənim arzum",
    "appLabel": "Azadlıq — şəxsi ritual",
    "canvasAria": "İşıq fiquru hərəkətə cavab verir və buraxdıqda açılır",
    "validation": "Ən azı $1 daxil et, məsələn 1 və ya 2,50.",
    "amountPrompt": "Ən azı $1 daxil et",
    "ready": "Buraxa bilərsən",
    "another": "Başqa bir niyyət",
    "doneNote": "Təşəkkürlər. Öz jestini etdin.",
    "holdingCaption": "Arzuna bir an diqqət ayır.",
    "holdingGratitude": "Nəyə görə minnətdar olduğunu xatırla.",
    "releaseCaption": "Niyyətini saxla. Gərginliyi burax.",
    "releaseGratitude": "Təşəkkür et və burax.",
    "completionCaption": "Niyyətini ifadə etdin.",
    "completionGratitude": "Bu diqqət anı üçün təşəkkürlər.",
    "phases": {
      "idle": "Niyyət",
      "holding": "Saxlama",
      "releasing": "Buraxma",
      "done": "Tamamlanma"
    },
    "musicEnable": "Musiqini aç",
    "musicDisable": "Musiqini söndür",
    "musicResume": "Musiqi toxunduqdan sonra başlayacaq.",
    "musicUnavailable": "Musiqi burada əlçatan deyil. Musiqisiz davam edə bilərsən.",
    "topics": {
      "wealth": {
        "name": "Sərvət",
        "intention": "Pul məsələlərində daha çox azadlıq istəyirəm.",
        "caption": "Daha çoxunu arzu et. Gərginliyi burax.",
        "outcome": "Bolluq arzu edib pula daha sakit yanaşa bilərsən."
      },
      "health": {
        "name": "Sağlamlıq",
        "intention": "Özümə daha qayğı ilə yanaşmaq istəyirəm.",
        "caption": "Niyyətinə bir an diqqət ayır.",
        "outcome": "Qoy bu niyyət özünə qayğı göstərmək üçün bir səbəb olsun."
      },
      "success": {
        "name": "Uğur",
        "intention": "Öz yolumda daha cəsarətlə irəliləmək istəyirəm.",
        "caption": "Məqsədini saxla. Artıq təzyiqi burax.",
        "outcome": "Niyyətin kiçik bir növbəti addımın başlanğıcı ola bilər."
      },
      "love": {
        "name": "Sevgi",
        "intention": "Daha çox səmimiyyət və yaxınlıq istəyirəm.",
        "caption": "Açıq qal. Gözləntiləri burax.",
        "outcome": "Özün olaraq qala və başqalarına açıq ola bilərsən."
      },
      "gratitude": {
        "name": "Minnətdarlıq",
        "intention": "Artıq sahib olduqlarım üçün təşəkkür edirəm.",
        "caption": "Təşəkkür etmək istədiyin bir şeyi xatırla.",
        "outcome": "Sahib olduqlarını qiymətləndirib daha çoxunu arzu edə bilərsən."
      }
    },
    "brand": "Azadlıq",
    "ritualName": "Heçliyə",
    "languageLabel": "Dil",
    "themeLabel": "Görünüş",
    "themes": { "system": "Cihazdakı kimi", "light": "Açıq", "dark": "Tünd" },
    "doneLabel": "Jest tamamlandı",
    "queryUnavailable": "Ödəniş hazırda əlçatan deyil. Pul tutulmadan sınaqdan keçirə bilərsən.",
    "musicError": "Musiqini açmaq mümkün olmadı. Musiqisiz davam edə bilərsən.",
    "releaseEffect": "İşıq açılır. Burax."
  }
};

export type Translation = typeof words.ru;

export const translations: Record<Locale, Translation> = words;
