<template>
  <v-app>
    <div v-show="isLoading" class="loading">Загрузка...</div>
    <v-main>
      <v-expansion-panels class="panel" v-model="panel">
        <v-expansion-panel>
          <v-expansion-panel-title>Фильтры</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="filters">
              <v-autocomplete
                v-model="filters.selected.events"
                :items="filters.value.events"
                item-title="title"
                item-value="id"
                label="Мероприятие"
                single-line
                hide-details
                variant="outlined"
                multiple
                chips
                clearable
              >
                <template v-slot:prepend-item>
                  <v-list-item>
                    <v-list-item-content>
                      <v-list-item-title>
                        <v-checkbox label="Выбрать все мероприятия" v-model="filters.selectAll.events" @change="() => toggleSelectAll('events')" />
                      </v-list-item-title>
                    </v-list-item-content>
                  </v-list-item>
                </template>
              </v-autocomplete>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <div class="buttons">
        <v-btn color="primary" @click="disableFilters()">отключить фильтры</v-btn>
        <v-btn color="info" @click="getData()">получить данные</v-btn>
        <v-btn color="success" class="takeScreenshot" @click="takeScreenshot">Создать скриншот</v-btn>
        <v-btn color="warning" @click="exportToExcel">Экспорт в Excel</v-btn>
      </div>
      <template v-for="(group, catId) in groupedDeals" :key="catId">
        <v-card class="my-4">
          <v-card-title class="text-center text-h5" :style="getTitleClass(group.title)">
            {{ group.title }}
          </v-card-title>
        </v-card>
        <v-data-table
          :items="group.items"
          :headers="categoryHeaders"
          hide-default-footer
        >
          <template v-slot:item.UF_CRM_1744062581756="{ item }">
            {{ new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(item.UF_CRM_1744062581756) }}
          </template>
          <template v-slot:item.COMMENTS="{ item }">
            <div v-html="replaceBrackets(item.COMMENTS)"></div>
          </template>
          <template v-slot:tfoot>
            <tfoot v-if="group.title !== 'Отказ'">
              <tr class="v-data-table__footer-row">
                <td colspan="2" class="text-left">Итого:</td>
                <td>{{ new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(group.totalSum) }}</td>
              </tr>
            </tfoot>
          </template>
        </v-data-table>
      </template>
      <img v-if="screenshotSrc" ref="screenshotImg" :src="screenshotSrc" alt="Скриншот страницы" id="screenshotImg"/>
      <div>
        <!-- Диалоговое окно выбора чата -->
        <v-dialog v-model="dialog" max-width="600">
          <v-card>
            <v-card-title class="headline">
              Выберите чат для отправки сообщения
            </v-card-title>
            <v-card-text>
              <v-text-field
                v-model="search"
                label="Поиск чатов"
                append-icon="mdi-magnify"
                clearable
                class="chats-input"
              ></v-text-field>
              <v-list>
                <v-list-item
                  v-for="chat in filteredChats"
                  :key="chat.id"
                  @click="selectChat(chat)"
                >
                  <v-list-item-content>
                    <v-list-item-title>{{ chat.title }}</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ chat.message.text || 'Нет сообщений' }}
                    </v-list-item-subtitle>
                  </v-list-item-content>
                  <v-list-item-action>
                    <v-icon v-if="selectedChatId.id === chat.id" color="primary">
                      mdi-check
                    </v-icon>
                  </v-list-item-action>
                </v-list-item>
              </v-list>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text @click="dialog = false">Отмена</v-btn>
              <v-btn
                color="primary"
                :disabled="!selectedChatId.id"
                @click="sendMessage"
              >
                Отправить
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
      <v-dialog v-model="errorDialog" max-width="500" class="errorDialog">
        <v-card>
          <v-card-title class="error white--text">Ошибка!</v-card-title>
          <v-card-text color="error" class="v-card-text mt-4 text-center">{{ errorDisplay }}</v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="primary" text @click="errorDialog = false">закрыть</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { callApi } from '../functions/callApi';
import moment from 'moment';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

const errorDialog = ref(false);
const successDialog = ref(false);
const errorDisplay = ref('');
const isLoading = ref(true);
const deals = ref([]);
const deals2 = ref([]);
const events = ref([]);
const chats = ref([]);
const panel = ref(true);
const dialog = ref(false);
const search = ref('');
const selectedChatId = ref({ id: null, chat_id: null });
const screenshotSrc = ref(null);

function replaceBrackets(text) {
  if (text === null) { return ''; }
  return text
    .replace(/\[/g, '<')
    .replace(/\]/g, '>')
    .replace(/<a href=/g, '<a href=')
    .replace(/<img src=/g, '<img src=')
    .replace(/<div style=/g, '<div style=');
}

const totalRow = ref({
  UF_CRM_1745222013992: 0,
  UF_CRM_1742971372921: 0,
  UF_CRM_1742972167794: 0,
  UF_CRM_1742972105926: 0,
  UF_CRM_1744062581756: 0,
});

const filteredChats = computed(() => {
  if (!search.value) {
    return chats.value;
  }
  return chats.value.filter(chat =>
    chat.title.toLowerCase().includes(search.value.toLowerCase())
  );
});

function selectChat(chat) {
  selectedChatId.value.id = chat.id;
  selectedChatId.value.chat_id = chat.chat_id;
}

async function sendMessage() {
  try {
    if (!selectedChatId.value.id) return;
    isLoading.value = true;
    let result = '';
    await new Promise((resolve) => {
      BX24.callMethod(
        "disk.folder.uploadfile",
        {
          id: 1143900,
          data: { NAME: "report.jpg" },
          fileContent: document.getElementById('screenshotImg').src.replace('data:image/png;base64,', ''),
          generateUniqueName: true,
        },
        function (res) {
          result = res.data();
          resolve();
        }
      );
    });
    BX24.callMethod(
      'im.disk.file.commit',
      {
        'CHAT_ID': selectedChatId.value.chat_id,
        'UPLOAD_ID': result.ID,
      },
      function(res) {}
    );
  } catch (error) {
    errorDisplay.value = error;
    errorDialog.value = true;
  } finally {
    isLoading.value = false;
    successDialog.value = true;
    dialog.value = false;
  }
}

async function takeScreenshot() {
  document.querySelector(".v-expansion-panels").style.display = 'none';
  document.querySelector(".buttons").style.display = 'none';
  document.querySelector(".takeScreenshot").style.display = 'none';
  try {
    isLoading.value = true;
    const canvas = await html2canvas(document.body);
    const imageSrc = canvas.toDataURL('image/png');
    screenshotSrc.value = imageSrc;
  } catch (error) {
    errorDisplay.value = error;
    errorDialog.value = true;
  } finally {
    document.querySelector(".v-expansion-panels").style.display = 'flex';
    document.querySelector(".buttons").style.display = 'flex';
    document.querySelector(".takeScreenshot").style.display = 'block';
    isLoading.value = false;
  }
  if (chats.value.length === 0) {
    const result = await callApi('im.recent.list', { 'SKIP_OPENLINES': 'Y' }, [], null, null, null);
    chats.value = JSON.parse(JSON.stringify(result));
  }
  dialog.value = true;
}

const filters = ref({
  value: {
    assigned: '',
    events: '',
    category: [
      { id: "C32:UC_LXYCFO", title: "Потенциал - холодный" },
      { id: "C32:UC_VJZ0FL", title: "Потенциал - теплый" },
      { id: "C32:UC_6VDO9F", title: "Договоренности - холодные" },
      { id: "C32:UC_5BBXZ5", title: "Договоренности - теплые" },
      { id: "C32:UC_R5DX1H", title: "Передано" },
      { id: "LOSE", title: "Отказ" },
    ],
  },
  selected: {
    assigned: [],
    events: [],
    category: [],
    dateFrom: null,
    dateTo: null,
  },
  selectAll: {
    assigned: false,
    events: false,
    category: false,
  }
});

function disableFilters() {
  panel.value = false;
  for (let i = 0; i < Object.keys(filters.value.selectAll).length; i++) {
    filters.value.selectAll[Object.keys(filters.value.selectAll)[i]] = false;
    filters.value.selected[Object.keys(filters.value.selected)[i]] = [];
  }
  filters.value.selected.dateFrom = null;
  filters.value.selected.dateTo = null;
}

const categoryHeaders = ref([
  { title: "Компания", key: "UF_CRM_1744890618774", align: "center" },
  { title: "Статус", key: "status", align: "center" },
  { title: "Сумма", key: "UF_CRM_1744062581756", align: "center" },
  { title: "Ключевое лицо", key: "keyPerson", align: "center" },
  { title: "Комментарий", key: "COMMENTS", align: "center" },
]);

const headers2 = ref([
  { title: "Мероприятие", key: "event", align: "center" },
  { title: "Дата начала мероприятия", key: "start", align: "center" },
  { title: "% Выполнения", key: "percent", align: "center" },
  { title: "Собрано", key: "summ", align: "center" },
  { title: "Собрано сверху", key: "over", align: "center" },
  { title: "План выручки", key: "planProfit", align: "center" },
  { title: "Потенциал", key: "pot", align: "center" },
  { title: "Договоренности", key: "dog", align: "center" },
  { title: "Сумma П/Д", key: "pd", align: "center" },
]);

async function getContactById(contactId) {
  if (!contactId) return null;
  
  try {
    const contact = await new Promise((resolve) => {
       BX24.callMethod(
          'crm.contact.get',
          {
              id: contactId,
          },
          (result) => {
            resolve(result.data());
          },
      );
    });
    return contact;
  } catch (error) {
    console.error('Ошибка получения контакта:', error);
    return null;
  }
}

const groupedDeals = computed(() => {
  const groups = {};
  const mergedCategories = [
    { title: "Передано", ids: ["C32:UC_R5DX1H"] },
    { title: "Договоренности", ids: ["C32:UC_6VDO9F", "C32:UC_5BBXZ5"] },
    { title: "Потенциал", ids: ["C32:UC_LXYCFO", "C32:UC_VJZ0FL"] },
    { title: "Отказ", ids: ["LOSE"] },
  ];

  mergedCategories.forEach(merged => {
    const activeIds = filters.value.selected.category.length === 0 
      ? merged.ids 
      : merged.ids.filter(id => filters.value.selected.category.includes(id));
    
    if (activeIds.length > 0) {
      const categoryDeals = deals.value.filter(d => activeIds.includes(d.STAGE_ID));
      const dealGroups = {};
      categoryDeals.forEach(deal => {
        const key = `${deal.UF_CRM_1744890618774}_${deal.status}`;
        if (!dealGroups[key]) {
          dealGroups[key] = {
            UF_CRM_1744890618774: deal.UF_CRM_1744890618774,
            status: deal.status,
            count: 0,
            UF_CRM_1744062581756: 0,
            keyPerson: deal.keyPerson,
            COMMENTS: [],
            STAGE_ID: deal.STAGE_ID
          };
        }
        dealGroups[key].count++;
        dealGroups[key].UF_CRM_1744062581756 += +deal.UF_CRM_1744062581756;
        if (deal.COMMENTS) {
          dealGroups[key].COMMENTS.push(deal.COMMENTS);
        }
      });

      Object.values(dealGroups).forEach(group => {
        group.COMMENTS = group.COMMENTS.map(comment => 
          replaceBrackets(comment || '').replace(/\n/g, '')
        ).join('');
      });

      groups[merged.title] = {
        title: merged.title,
        items: Object.values(dealGroups),
        totalSum: Object.values(dealGroups).reduce((acc, item) => acc + +item.UF_CRM_1744062581756, 0)
      };
    }
  });
  return groups;
});

const toggleSelectAll = (type) => {
  if (filters.value.selectAll[type]) {
    filters.value.selected[type] =
      typeof filters.value.value[type][0] === 'object'
        ? filters.value.value[type].map((item) => item.id || item.ID)
        : filters.value.value[type];
  } else {
    filters.value.selected[type] = [];
  }
};

const groupedEvents = computed(() => {
  const groups = {};
  deals.value.forEach(deal => {
    const event = events.value.find(e => e.id == deal.UF_CRM_1742797326);
    const planProfit = event && event.ufCrm38_1745221903440 ? event.ufCrm38_1745221903440.replace('|RUB', "") : 0;
    if (!groups[deal.UF_CRM_1742797326]) {
      groups[deal.UF_CRM_1742797326] = {
        UF_CRM_1742797326: deal.UF_CRM_1742797326,
        percent: event && event.ufCrm38_1750948951651 ? event.ufCrm38_1750948951651 : null,
        start: event && event.ufCrm38_1745307580193 ? moment(event.ufCrm38_1745307580193.split('T')[0]).format('DD.MM.YYYY') : null,
        summ: 0,
        pot: 0,
        planProfit: planProfit,
        over: -planProfit,
        dog: 0,
        pd: 0,
        UF_CRM_1744062581756: deal.UF_CRM_1744062581756,
        STAGE_ID: deal.STAGE_ID,
        event: event && event.title ? event.title : '',
        UF_CRM_1745222013992: deal.UF_CRM_1745222013992,
      };
    }
    const summDeal = parseInt(deal.UF_CRM_1744062581756);
    if (deal.STAGE_ID === "C32:UC_LXYCFO" || deal.STAGE_ID === "C32:UC_VJZ0FL") {
      groups[deal.UF_CRM_1742797326].pot += summDeal;
    } else if (deal.STAGE_ID === "C32:UC_5BBXZ5" || deal.STAGE_ID === "C32:UC_6VDO9F") {
      groups[deal.UF_CRM_1742797326].dog += summDeal;
    } else if (deal.STAGE_ID === "C32:UC_R5DX1H") {
      groups[deal.UF_CRM_1742797326].summ += summDeal;
    }
    if (deal.STAGE_ID === "C32:UC_LXYCFO" || deal.STAGE_ID === "C32:UC_VJZ0FL" || deal.STAGE_ID === "C32:UC_5BBXZ5" || deal.STAGE_ID === "C32:UC_6VDO9F") {
      groups[deal.UF_CRM_1742797326].pd += summDeal;
    }
    if (deal.STAGE_ID === "C32:UC_LXYCFO" || deal.STAGE_ID === "C32:UC_VJZ0FL" || deal.STAGE_ID === "C32:UC_R5DX1H" || deal.STAGE_ID === "C32:UC_5BBXZ5" || deal.STAGE_ID === "C32:UC_6VDO9F") {
      groups[deal.UF_CRM_1742797326].over += summDeal;
    }
  });

  for (let key in groups) {
    const innerObj = groups[key];
    if (innerObj.over !== undefined && innerObj.over <= 0) {
      innerObj.over = '';
    }
  }
  return Object.values(groups);
});

const totalRow2 = computed(() => {
  if (groupedEvents.value !== undefined) {
    const row = {
      summ: 0,
      pot: 0,
      dog: 0,
      pd: 0,
      over: 0,
      planProfit: 0,
    };
    groupedEvents.value.forEach(deal => {
      row.summ += +deal.summ;
      row.pot += +deal.pot;
      row.dog += +deal.dog;
      row.pd += +deal.pd;
      row.over += +deal.over;
      row.planProfit += +deal.planProfit;
    });
    return row;
  }
});

function displayFullName(firstName, middleName, lastName) {
  const fullNameParts = [];
  if (firstName) fullNameParts.push(firstName);
  if (middleName) fullNameParts.push(middleName);
  if (lastName) fullNameParts.push(lastName);
  return fullNameParts.join(' ') || 'Имя не указано';
}

function stageMap(stage) {
  let stageName;
  switch (stage) {
    case "C32:UC_LXYCFO": stageName = "Потенциал - холодный"; break;
    case "C32:UC_VJZ0FL": stageName = "Потенциал - теплый"; break;
    case "C32:UC_6VDO9F": stageName = "Договоренности - холодные"; break;
    case "C32:UC_5BBXZ5": stageName = "Договоренности - теплые"; break;
    case "C32:UC_R5DX1H": stageName = "Передано"; break;
    default: stageName = ""; break;
  }
  return stageName;
}
async function exportToExcel() {
  try {
    isLoading.value = true;
    const wb = XLSX.utils.book_new();
    
    // Создаем массив для всех данных
    const allData = [];

    // Проходим по всем группам и добавляем их данные
    Object.keys(groupedDeals.value).forEach((catId) => {
      const group = groupedDeals.value[catId];
      
      // Добавляем заголовок группы (будем объединять ячейки)
      allData.push([group.title]);
      
      // Добавляем заголовки таблицы
      allData.push(categoryHeaders.value.map(header => header.title));
      
      // Добавляем данные группы
      group.items.forEach(item => {
        const row = categoryHeaders.value.map(header => {
          if (header.key === 'UF_CRM_1744062581756') {
            return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(item[header.key]);
          } else if (header.key === 'COMMENTS') {
            return replaceBrackets(item[header.key] || '').replace(/<[^>]+>/g, '');
          } else if (header.key === 'keyPerson') {
            return item[header.key] || 'Не указано';
          }
          return item[header.key] || '';
        });
        allData.push(row);
      });
      
      // Добавляем итоговую строку для группы (кроме Отказа)
      if (group.title !== "Отказ") {
        const totalRow = Array(categoryHeaders.value.length).fill('');
        totalRow[0] = 'Итого:';
        totalRow[categoryHeaders.value.length - 3] = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(group.totalSum);
        allData.push(totalRow);
      }
      
      // Добавляем пустые строки между группами
      allData.push(['']);
    });

    // Создаем рабочий лист
    const ws = XLSX.utils.aoa_to_sheet(allData);
    
    // Настраиваем ширину колонок
    ws['!cols'] = categoryHeaders.value.map(() => ({ wch: 25 }));
    
    // Определяем диапазон ячеек
    const range = XLSX.utils.decode_range(ws['!ref']);
    
    // Переменные для отслеживания позиций заголовков групп
    let groupHeaderRow = 2; // Начинаем с третьей строки (после основного заголовка)
    
    // Применяем стили ко всем ячейкам
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_address = {c: C, r: R};
        const cell_ref = XLSX.utils.encode_cell(cell_address);
        
        if (!ws[cell_ref]) continue;
        
        // Основной заголовок отчета
        if (R === 0 && C === 0) {
          ws[cell_ref].s = {
            font: { bold: true, sz: 16 },
            alignment: { horizontal: "center" }
          };
          // Объединяем ячейки для основного заголовка
          if (!ws['!merges']) ws['!merges'] = [];
          ws['!merges'].push({ s: {r: 0, c: 0}, e: {r: 0, c: categoryHeaders.value.length - 1} });
        }
        
        // Заголовки групп
        const groupTitles = ["Передано", "Договоренности", "Потенциал", "Отказ"];
        if (groupTitles.includes(ws[cell_ref].v)) {
          ws[cell_ref].s = {
            fill: { 
              patternType: "solid", 
              fgColor: { 
                rgb: ws[cell_ref].v === "Передано" ? "7BC56E" : 
                     ws[cell_ref].v === "Договоренности" ? "FFF893" : 
                     ws[cell_ref].v === "Потенциал" ? "FFF893" : 
                     "FF5852" 
              } 
            },
            font: { bold: true, color: { rgb: "000000" } },
            alignment: { horizontal: "center" }
          };
          
          // Объединяем ячейки для заголовков групп
          if (!ws['!merges']) ws['!merges'] = [];
          ws['!merges'].push({ 
            s: {r: R, c: 0}, 
            e: {r: R, c: categoryHeaders.value.length - 1} 
          });
          
          groupHeaderRow = R;
        }
        
        // Заголовки столбцов (первая строка после заголовка группы)
        if (R === groupHeaderRow + 1) {
          ws[cell_ref].s = {
            fill: { patternType: "solid", fgColor: { rgb: "676767" } },
            font: { bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center" }
          };
        }
        
        // Итоговые строки
        if (ws[cell_ref].v === 'Итого:') {
          ws[cell_ref].s = {
            font: { bold: true },
            alignment: { horizontal: "left" }
          };
        }
      }
    }

    // Добавляем лист в книгу
    XLSX.utils.book_append_sheet(wb, ws, 'Отчет по сделкам');
    
    // Сохраняем файл
    XLSX.writeFile(wb, 'Deals_Report.xlsx');
  } catch (error) {
    errorDisplay.value = error.message || 'Ошибка при экспорте в Excel';
    errorDialog.value = true;
  } finally {
    isLoading.value = false;
  }
}

onMounted(async () => {
  filters.value.value.events = await callApi("crm.item.list", { "!ufCrm38_1751875905992": "null" }, ["id", "title"], 1052, 0, 0);
  const assigned = await callApi("user.get", {}, ["NAME", "SECOND_NAME", "LAST_NAME", "ID"], null, 0, 0);
  assigned.forEach(user => {
    const parts = [];
    if (user.NAME) parts.push(user.NAME);
    if (user.SECOND_NAME) parts.push(user.SECOND_NAME);
    if (user.LAST_NAME) parts.push(user.LAST_NAME);
    user.FULL_NAME = parts.join(' ');
  });
  filters.value.value.assigned = JSON.parse(JSON.stringify(assigned));
  await getData();
  isLoading.value = false;
});

const getData = async () => {
  isLoading.value = true;
  totalRow.value = {
    UF_CRM_1745222013992: 0,
    UF_CRM_1742971372921: 0,
    UF_CRM_1742972167794: 0,
    UF_CRM_1742972105926: 0,
    UF_CRM_1744062581756: 0,
  };
  const filterCategory = filters.value.selected.category.length === 0 ? filters.value.value.category.map(item => item.id) : filters.value.selected.category;
  const filterEvents = filters.value.selected.events.length === 0 ? filters.value.value.events.map(item => item.id) : filters.value.selected.events;
  let dates = [];
  if (filters.value.selected.dateFrom) {
    dates[0] = moment(filters.value.selected.dateFrom).format('YYYY-MM-DD');
  } else {
    dates[0] = null;
  }
  if (filters.value.selected.dateTo) {
    dates[1] = moment(filters.value.selected.dateTo).add(1, 'days').format('YYYY-MM-DD');
  } else {
    dates[1] = null;
  }
  let dealsLocal = await callApi("crm.deal.list", { "STAGE_ID": filterCategory, "UF_CRM_1742797326": filterEvents }, ["UF_CRM_1744096783472", 'UF_CRM_1742797326', "STAGE_ID", "ASSIGNED_BY_ID", 'UF_CRM_1744890618774', 'UF_CRM_1744062581756', 'UF_CRM_1745995594', 'UF_CRM_1744064620850', 'UF_CRM_1744095783871', 'UF_CRM_1742906712910', "UF_CRM_1745222013992", "UF_CRM_1742971372921", "UF_CRM_1742972105926", "UF_CRM_1742972167794", "UF_CRM_1745308616558", "COMMENTS", "CONTACT_ID"], null, 0, 0);
  const date = moment();
  const isoDate = date.toISOString();
  events.value = await new Promise((resolve) => {
    BX24.callMethod(
      'crm.item.list',
      {
        entityTypeId: 1052,
        filter: { ">ufCrm38_1751875905992": isoDate },
        order: { id: 'DESC' },
      },
      (result) => {
        if (result.error()) {
          console.error(result.error());
          return;
        }
        resolve(result.data().items);
      }
    );
  });
  const statuses = await new Promise((resolve) => {
    BX24.callMethod(
      'crm.item.list',
      {
        entityTypeId: 1080,
        order: { id: 'DESC' },
      },
      (result) => {
        if (result.error()) {
          console.error(result.error());
          return;
        }
        resolve(result.data().items);
      }
    );
  });
  const usersFind = Array.from(new Set(dealsLocal.map(deal => deal.ASSIGNED_BY_ID)));
  const users = await callApi("user.get", { "ID": usersFind }, []);
const contactIds = Array.from(new Set(dealsLocal.map(deal => deal.CONTACT_ID).filter(id => id)));

  const contacts = {};
  for (const contactId of contactIds) {
    const contact = await getContactById(contactId);
    if (contact) {
      contacts[contactId] = contact;
    }
  }
  dealsLocal.forEach(obj => {
    const event = events.value.find(e => e.id == obj.UF_CRM_1742797326);
    const user = users.find(e => e.ID == obj.ASSIGNED_BY_ID);
    const status = statuses.find(e => e.id == obj.UF_CRM_1745995594[0]);
    obj.UF_CRM_1745995594 = obj.UF_CRM_1745995594[0];
    obj.UF_CRM_1745222013992 = obj.UF_CRM_1745222013992 ? obj.UF_CRM_1745222013992.replace('|RUB', "") : 0;
    obj.UF_CRM_1742971372921 = obj.UF_CRM_1742971372921 ? obj.UF_CRM_1742971372921.replace('|RUB', "") : 0;
    obj.UF_CRM_1742972105926 = obj.UF_CRM_1742972105926 ? obj.UF_CRM_1742972105926.replace('|RUB', "") : 0;
    obj.UF_CRM_1742972167794 = obj.UF_CRM_1742972167794 ? obj.UF_CRM_1742972167794.replace('|RUB', "") : 0;
    obj.UF_CRM_1744062581756 = obj.UF_CRM_1744062581756 ? obj.UF_CRM_1744062581756.replace('|RUB', "") : 0;
    obj.event = event && event.title ? event.title : "";
    obj.ASSIGNED_BY_ID = displayFullName(user.LAST_NAME, user.NAME, user.SECOND_NAME);
    obj.status = status && status.title ? status.title : "";
    obj.stage = stageMap(obj.STAGE_ID);
    if (obj.CONTACT_ID && contacts[obj.CONTACT_ID]) {
      const contact = contacts[obj.CONTACT_ID];
      obj.keyPerson = displayFullName(contact.LAST_NAME, contact.NAME, contact.SECOND_NAME);
    } else {
      obj.keyPerson = "Не указано";
    }
  });
  dealsLocal.forEach(deal => {
    totalRow.value.UF_CRM_1745222013992 += +deal.UF_CRM_1745222013992;
    totalRow.value.UF_CRM_1742971372921 += +deal.UF_CRM_1742971372921;
    totalRow.value.UF_CRM_1742972167794 += +deal.UF_CRM_1742972167794;
    totalRow.value.UF_CRM_1742972105926 += +deal.UF_CRM_1742972105926;
    totalRow.value.UF_CRM_1744062581756 += +deal.UF_CRM_1744062581756;
  });
  deals.value = JSON.parse(JSON.stringify(dealsLocal));
  deals2.value = [];
  isLoading.value = false;
};

function getTitleClass(title) {
  if (title.includes('Потенциал') || title.includes('Договоренности')) return { 'background-color': '#fff893' };
  if (title.includes('Передано')) return { 'background-color': '#7bc56e' };
  if (title.includes('Отказ')) return { 'background-color': '#ff5852' };
  return { 'background-color': 'grey' };
}
</script>
<style lang="sass">
  .v-list-item__content
    display: flex
    align-items: center
    justify-content: space-between

  .v-stepper-actions
    display: none

  .v-stepper-window
    margin: 0.6rem !important

  .v-messages, .v-input__details
    display: none

  .links
    padding: 0

  .links .v-list-item
    padding: 0

  .links .v-list-item__content
    border-bottom: 1px rgba(var(--v-border-color), 0.5) solid
    padding: 0.5rem
    padding-bottom: 1rem

  .v-card-text
    display: flex
    flex-direction: column
    gap: 1.5rem

  .success.white--text
    background: #4cb050
    display: flex
    align-items: center
    justify-content: center
    padding: 0 1rem
    height: 4rem
    color: white
    font-size: 1.25rem

  .error.white--text
    background: #e30f0f
    display: flex
    align-items: center
    justify-content: center
    padding: 0 1rem
    height: 4rem
    color: white
    font-size: 1.25rem

  .successDialog .v-card-actions, .errorDialog .v-card-actions
    border-top: 1px solid #dddddd

  .loading 
    width: 100%
    height: 100%
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center
    gap: 1rem
    font-size: 2rem
    font-weight: 500

  .v-table .v-table__wrapper > table > tbody > tr > td, .v-table .v-table__wrapper > table > thead > tr > th, .v-table .v-table__wrapper > table > tfoot > tr > td
    border: thin solid rgba(var(--v-border-color), var(--v-border-opacity))
    text-align: center

  .v-table 
    border-radius: 0.25rem
    border: 2px solid rgba(var(--v-border-color), var(--v-border-opacity))

  .v-data-table-footer
    justify-content: center

  .filters
    display: grid
    grid-template-columns: 1fr 1fr
    gap: 1rem
    margin-bottom: 1rem

  .filters .v-input__control
    height: 100%
    max-height: 5rem !important
    
  .filters .v-field__field
    overflow: hidden

  .buttons
    width: 100%
    display: flex
    align-items: center
    justify-content: center
    gap: 1rem
    margin-top: 2rem
    display: grid
    grid-template-columns: 1fr 1fr

  .loading 
    width: 100%
    height: 100%
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center
    gap: 1rem
    font-size: 2rem
    font-weight: 500
    z-index: 5
    position: absolute
    background: white

  .date-title
    display: flex
    justify-content: space-between

  .v-dialog > .v-overlay__content > .v-card, .v-dialog > .v-overlay__content > form > .v-card
    padding: 1em

  .v-dialog > .v-overlay__content > .v-card > .v-card-actions, .v-dialog > .v-overlay__content > form > .v-card > .v-card-actions
    justify-content: center

  .v-main
    padding: 0.75rem

  .v-data-table__th 
    background: #676767
    color: white

  tbody .v-data-table__tr:nth-child(even)
    background-color: white

  tbody .v-data-table__tr:nth-child(odd)
    background-color: #dddddd

</style>
