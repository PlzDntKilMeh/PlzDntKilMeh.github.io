// === NEW: PUBG Translation dictionary ===
let damageTranslationDict = null;

async function fetchTranslations() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/pubg/api-assets/refs/heads/master/dictionaries/telemetry/damageCauserName.json');
        if (response.ok) {
            damageTranslationDict = await response.json();
            console.log('Damage translations loaded');
        }
    } catch (e) {
        console.warn('Failed to load translations from GitHub, falling back to raw IDs', e);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // Load translations and JSON data
    fetchTranslations();
    fetch('combined_data.json')
        .then(response => response.json())
        .then(data => {
            createTabsAndTables(data);
            createSqlTab('Kills', 'kill_v2_events');
            createSqlTab('Knocks', 'groggy_events');
        })
        .catch(error => console.error('Error loading JSON:', error));
});

// === EXISTING FUNCTION (unchanged) ===
function createTabsAndTables(data) {
    const tabsContainer = document.getElementById('tabs-container');
    const contentContainer = document.getElementById('content-container');
    const infoContainer = document.getElementById('info-container');

    let firstTab = true;

    for (const key in data) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.innerText = key;
        tabsContainer.appendChild(tab);

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';
        tableWrapper.style.display = firstTab ? 'block' : 'none';

        const table = document.createElement('table');
        table.id = key;
        table.classList.add('table-content');
        tableWrapper.appendChild(table);
        contentContainer.appendChild(tableWrapper);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'info-div';
        infoDiv.innerHTML = `Kills: ${data[key]["kills_count"]} ${data[key]["last_update"]}`;
        infoDiv.style.display = firstTab ? 'block' : 'none';
        infoContainer.appendChild(infoDiv);

        createTable(table, (data[key]["scoreboard"] || []).sort((a, b) => (b.break_taken || 0) - (a.break_taken || 0)));

        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.table-wrapper, .telemetry-wrapper').forEach(w => w.style.display = 'none');
            document.querySelectorAll('.info-div').forEach(i => i.style.display = 'none');

            tab.classList.add('active');
            tableWrapper.style.display = 'block';
            infoDiv.style.display = 'block';
        });

        if (firstTab) {
            tab.classList.add('active');
            firstTab = false;
        }
    }
}

// === NEW FUNCTION: SQL tab with SQLite + column filters ===
let dbInstance = null;

async function createSqlTab(tabLabel, tableName) {
    const tabsContainer = document.getElementById('tabs-container');
    const contentContainer = document.getElementById('content-container');
    const infoContainer = document.getElementById('info-container');

    const telemetryTab = document.createElement('div');
    telemetryTab.className = 'tab';
    telemetryTab.innerText = tabLabel;
    tabsContainer.appendChild(telemetryTab);

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'telemetry-wrapper';
    tableWrapper.style.display = 'none';
    contentContainer.appendChild(tableWrapper);

    const telemetryContent = document.createElement('div');
    telemetryContent.className = 'telemetry-content';
    tableWrapper.appendChild(telemetryContent);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'info-div';
    infoDiv.innerHTML = `${tabLabel} data (<span id="db-status-${tableName}"></span>)`;
    infoDiv.style.display = 'none';
    infoContainer.appendChild(infoDiv);

    telemetryTab.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.table-wrapper, .telemetry-wrapper').forEach(w => w.style.display = 'none');
        document.querySelectorAll('.info-div').forEach(i => i.style.display = 'none');

        telemetryTab.classList.add('active');
        tableWrapper.style.display = 'block';
        infoDiv.style.display = 'block';

        if (!dbInstance) {
            await loadSQLiteDatabase(infoDiv, tableName);
        }
        if (dbInstance) {
            renderSqlTable(telemetryContent, tableName);
        }
    });
}

async function loadSQLiteDatabase(infoDiv, tableName) {
    const statusSpan = infoDiv.querySelector('span[id^="db-status"]');
    const loadingText = statusSpan || infoDiv;
    loadingText.innerHTML = '<strong style="color:#ffaa00">Loading 49MB DB...</strong>';

    try {
        const config = {
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${file}`
        };
        const SQL = await initSqlJs(config);

        const response = await fetch('./telemetry_index.sqlite3');
        if (!response.ok) throw new Error(`HTTP ${response.status} — file missing?`);

        const arrayBuffer = await response.arrayBuffer();
        dbInstance = new SQL.Database(new Uint8Array(arrayBuffer));

        loadingText.innerHTML = '<strong style="color:#00cc00">Loaded successfully ✓</strong>';
        console.log('33MB SQLite database loaded into memory');
    } catch (err) {
        console.error(err);
        loadingText.innerHTML = '<strong style="color:#ff4444">Failed to load DB</strong>';
        alert('Could not load telemetry_index.sqlite3\nMake sure the file is in the repo root and deployed to GitHub Pages.');
    }
}

function renderSqlTable(containerElement, tableName) {
    const PAGE_SIZE = 100;
    let currentFilters = {};
    let currentOffset = 0;
    let currentSort = 'event_time'; // Default sort
    let sortDirection = 'DESC';     // Default direction
    let showRowNumbers = false;     // Default to hidden

    // === DEFAULT COLUMNS TO SHOW ===
    let defaultVisibleColumns;
    if (tableName === 'kill_v2_events') {
        defaultVisibleColumns = new Set(['youtube_url', 'event_time', 'has_youtube', 'killer_name', 'victim_name','finisher_name']);
    } 
	if(tableName === 'groggy_events'){
		defaultVisibleColumns = new Set(['youtube_url', 'event_time', 'has_youtube', 'attacker_name', 'victim_name',]);
	}

    renderCurrentPage(containerElement, PAGE_SIZE, currentFilters, currentOffset, defaultVisibleColumns);

    async function renderCurrentPage(container, limit, filters, offset, visibleColumns) {
        // Capture focus state before re-rendering
        const focusedElement = document.activeElement;
        const focusedCol = focusedElement && focusedElement.classList.contains('column-filter') ? focusedElement.dataset.col : null;
        const cursorPos = focusedElement ? focusedElement.selectionStart : null;

        container.innerHTML = `<p style="padding:20px; color:#00cc00;">Loading data...</p>`;

        try {
            function sqlNormalizedTextExpr(columnName) {
                // Normalize common “looks-like”/invisible characters that can make substring searches
                // fail even when the rendered text appears to match.
                // Note: this is applied only for filtering (already non-index-friendly due to %...% LIKE).
                let expr = `COALESCE("${columnName}", '')`;
                // Whitespace/control chars that sometimes sneak into ingested text
                expr = `REPLACE(${expr}, char(9), ' ')`;     // tab
                expr = `REPLACE(${expr}, char(10), ' ')`;    // LF
                expr = `REPLACE(${expr}, char(13), ' ')`;    // CR
                expr = `REPLACE(${expr}, char(160), ' ')`;   // NBSP
                expr = `REPLACE(${expr}, char(8203), '')`;   // zero-width space
                // Common confusable: Cyrillic 'Р/р' looks like Latin 'P/p'
                expr = `REPLACE(${expr}, 'Р', 'P')`;
                expr = `REPLACE(${expr}, 'р', 'p')`;
                return expr;
            }

            const DAMAGE_TRANSLATION_COLS = new Set([
                'damageCauserName',
                'finishDamageInfo_damageCauserName',
                'killerDamageInfo_damageCauserName',
                'dBNODamageInfo_damageCauserName',
            ]);

            function buildFilterPredicate(col, filterValue) {
                // Always support filtering by the raw DB value (case-insensitive).
                const predicates = [`LOWER(${sqlNormalizedTextExpr(col)}) LIKE LOWER(?)`];
                const predicateParams = [`%${filterValue}%`];

                // If we have a translation dict, also allow filtering by the translated/friendly value,
                // while still keeping the underlying data stored as the raw PUBG enum/id.
                if (damageTranslationDict && DAMAGE_TRANSLATION_COLS.has(col)) {
                    const needle = String(filterValue).toLowerCase();
                    const matchingRawIds = [];

                    // Find raw IDs whose friendly value matches the user's input.
                    // Cap list size to avoid huge SQL IN(...) clauses.
                    for (const rawId in damageTranslationDict) {
                        const friendly = damageTranslationDict[rawId];
                        if (!friendly) continue;
                        if (String(friendly).toLowerCase().includes(needle)) {
                            matchingRawIds.push(rawId);
                            if (matchingRawIds.length >= 200) break;
                        }
                    }

                    if (matchingRawIds.length > 0) {
                        predicates.push(`"${col}" IN (${matchingRawIds.map(() => '?').join(',')})`);
                        predicateParams.push(...matchingRawIds);
                    }
                }

                return { sql: `(${predicates.join(' OR ')})`, params: predicateParams };
            }

            // Build WHERE clause
            let whereClauses = [];
            let params = [];
            Object.keys(filters).forEach(col => {
                if (filters[col]) {
                    // Force case-insensitive filtering regardless of SQLite LIKE settings/build flags.
                    // Also avoid NULLs turning the predicate into NULL (non-match).
                    const predicate = buildFilterPredicate(col, filters[col]);
                    whereClauses.push(predicate.sql);
                    params.push(...predicate.params);
                }
            });
            const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Total matching rows
            const countResult = dbInstance.exec(`SELECT COUNT(*) FROM "${tableName}" ${whereSQL}`, params);
            const totalMatching = countResult[0].values[0][0];

            // Get all column names
            const colResult = dbInstance.exec(`PRAGMA table_info("${tableName}")`);
            const allColumns = colResult[0].values.map(row => row[1]);

            // Build ORDER BY clause
            const orderSQL = currentSort ? `ORDER BY "${currentSort}" ${sortDirection}` : '';

            // Get current page data
            const dataSQL = `SELECT * FROM "${tableName}" ${whereSQL} ${orderSQL} LIMIT ${limit} OFFSET ${offset}`;
            const result = dbInstance.exec(dataSQL, params);
            const rows = result && result[0] ? result[0].values : [];

            const hasPrevious = offset > 0;
            const hasMore = offset + rows.length < totalMatching;

            // ==================== COLUMN SELECTOR (SINGLE UNIFIED TABLE) ====================
            // Determine which categories are relevant for this table
            let rowLabels = ['Killer', 'Victim'];
            if (tableName === 'kill_v2_events') {
                rowLabels.push('Finisher', 'dBNOMaker');
            }
            
            const suffixToCols = {}; 
            const otherCols = [];

            allColumns.forEach(col => {
                let lower = col.toLowerCase();
                let category = null;
                let suffix = col;

                if (lower.startsWith('killer_') || lower.startsWith('attacker_')) {
                    category = 'Killer';
                    suffix = col.replace(/^(killer|attacker)_/i, '');
                } else if (lower.startsWith('victim_')) {
                    category = 'Victim';
                    suffix = col.replace(/^victim_/i, '');
                } else if (lower.startsWith('finisher_') || lower.startsWith('finish_')) {
                    category = 'Finisher';
                    suffix = col.replace(/^(finisher|finish)_/i, '');
                } else if (lower.startsWith('dbnomaker_')) {
                    category = 'dBNOMaker';
                    suffix = col.replace(/^dbnomaker_/i, '');
                } else if (lower.includes('vehicle_')) {
                    if (lower.startsWith('killer')) category = 'Killer';
                    else if (lower.startsWith('victim')) category = 'Victim';
                    suffix = col.split('_').slice(1).join('_'); 
                } else if (lower.includes('damageinfo_')) {
                    if (lower.startsWith('killer')) category = 'Killer';
                    else if (lower.startsWith('finish')) category = 'Finisher';
                    else if (lower.startsWith('dbno')) category = 'dBNOMaker';
                    suffix = col.split('_').slice(1).join('_'); 
                } else if (tableName === 'groggy_events') {
                    const knownSuffixes = ['name', 'accountId', 'isInBlueZone', 'isInRedZone', 'isInVehicle', 'zone_json', 'damageReason', 'damageCauserName', 'distance', 'isThroughPenetrableWall'];
                    if (knownSuffixes.includes(col)) {
                        category = 'Killer';
                        suffix = col;
                    }
                }

                if (category) {
                    if (!suffixToCols[suffix]) suffixToCols[suffix] = {};
                    suffixToCols[suffix][category] = col;
                } else {
                    otherCols.push(col);
                }
            });

            // Logical order for fields
            const orderedSuffixes = [
                'name', 'accountId', 'isInBlueZone', 'isInRedZone', 'isInVehicle', 'zone_json',
                'vehicleId', 'isWheelsInAir', 'isInWaterVolume', 'velocity',
                'damageReason', 'damageCauserName', 'distance', 'isThroughPenetrableWall', 'damageCauserAdditionalInfo_json'
            ].filter(s => suffixToCols[s]);

            // Add any other suffixes found that aren't in the ordered list
            Object.keys(suffixToCols).forEach(s => {
                if (!orderedSuffixes.includes(s)) orderedSuffixes.push(s);
            });

            const displayNames = {
                'name': 'Name', 'accountId': 'ID', 'isInBlueZone': 'inBlue', 'isInRedZone': 'inRed', 'isInVehicle': 'inCar', 'zone_json': 'location',
                'vehicleId': 'CarName', 'isWheelsInAir': 'CarInAir?', 'isInWaterVolume': 'CarInWater?', 'velocity': 'Speed',
                'damageReason': 'dmgReason', 'damageCauserName': 'dmgCauser', 'distance': 'Dist', 'isThroughPenetrableWall': 'Wallbang', 'damageCauserAdditionalInfo_json': 'attachments'
            };

            let columnSelectorHTML = `
                <div style="background:#1f1f1f; padding:3px 10px; border-radius:8px; margin-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px; flex-wrap:wrap;">
                        <strong style="font-size:0.8em;">Filters:</strong> 
                        <div style="display:flex; gap:3px;">
                            <button class="show-all-btn" style="padding:0px 5px; font-size:0.75em; height:18px;">Show All</button>
                            <button class="reset-cols-btn" style="padding:0px 5px; font-size:0.75em; height:18px;">Reset</button>
                        </div>
                        <label style="display:flex; align-items:center; gap:3px; font-size:0.75em; cursor:pointer; background:#333; padding:0px 5px; border-radius:3px; height:18px;">
                            <input type="checkbox" id="toggle-row-nums" ${showRowNumbers ? 'checked' : ''} style="transform: scale(0.7); margin:0;">
                            Row#
                        </label>
                    </div>

                    <div class="column-selector-wrapper" style="padding:5px; margin-bottom:5px;">
                        <table class="column-selector-table">
                            <thead>
                                <tr>
                                    <th style="position: sticky; left: 0; z-index: 3;">Category</th>
                                    ${orderedSuffixes.map(s => `<th>${displayNames[s] || s}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
            `;

            rowLabels.forEach(cat => {
                columnSelectorHTML += `<tr><td class="category-label">${cat}</td>`;
                orderedSuffixes.forEach(s => {
                    const colName = suffixToCols[s] ? suffixToCols[s][cat] : null;
                    if (colName) {
                        const isVisible = visibleColumns.has(colName);
                        columnSelectorHTML += `
                            <td>
                                <input type="checkbox" class="col-toggle" data-col="${colName}" ${isVisible ? 'checked' : ''} style="cursor:pointer; transform:scale(0.85);">
                            </td>`;
                    } else {
                        columnSelectorHTML += `<td>-</td>`;
                    }
                });
                columnSelectorHTML += `</tr>`;
            });

            columnSelectorHTML += `</tbody></table></div>`;

            if (otherCols.length > 0) {
                columnSelectorHTML += `<div class="other-cols-group" style="margin-top:0; padding-top:5px;">`;
                otherCols.forEach(col => {
                    const isVisible = visibleColumns.has(col);
                    columnSelectorHTML += `
                        <label style="display:flex; align-items:center; gap:4px; font-size:0.75em; cursor:pointer; background:#2a2a2a; padding:1px 6px; border-radius:3px;">
                            <input type="checkbox" class="col-toggle" data-col="${col}" ${isVisible ? 'checked' : ''} style="transform:scale(0.8);">
                            ${col}
                        </label>`;
                });
                columnSelectorHTML += `</div>`;
            }

            columnSelectorHTML += `</div>`;

            function getColWidth(col) {
                if (col === 'youtube_url') return '70px';
                if (col.includes('_json') || col.includes('AdditionalInfo')) return '200px';
                if (col.includes('name')) return '120px';
                if (col.startsWith('is') || col.includes('has_')) return '70px';
                return '100px';
            }

            // ==================== SCROLLABLE TABLE ====================
            const rowNumStyle = showRowNumbers ? '' : 'display:none;';
            let tableHTML = `
                <div style="max-height: 50vh; overflow: auto; border: 1px solid #333; border-radius: 6px;">
                    <table class="sql-table">
                        <thead>
                            <tr>
                                <th style="position: sticky; top: 0; left: 0; background: #1a1a1a; z-index: 20; width: 50px; min-width: 50px; ${rowNumStyle}">#</th>`;

            allColumns.forEach(col => {
                const displayStyle = visibleColumns.has(col) ? '' : 'display:none;';
                const sortIcon = currentSort === col ? (sortDirection === 'ASC' ? ' ▴' : ' ▾') : '';
                const w = getColWidth(col);
                
                tableHTML += `
                    <th class="sortable-header" data-col="${col}" 
                        style="position: sticky; top: 0; background: #1a1a1a; z-index: 10; cursor: pointer; user-select: none; 
                               width: ${w}; min-width: ${w}; max-width: ${w}; ${displayStyle}">
                        ${col}${sortIcon}
                    </th>`;
            });
            tableHTML += `</tr><tr>`;

            // Filter row
            tableHTML += `<th style="position: sticky; top: 40px; left: 0; background: #1a1a1a; z-index: 20; ${rowNumStyle}"></th>`;
            allColumns.forEach(col => {
                const displayStyle = visibleColumns.has(col) ? '' : 'display:none;';
                const val = filters[col] || '';
                const w = getColWidth(col);

                tableHTML += `
                    <th style="position: sticky; top: 40px; background: #1a1a1a; z-index: 10; 
                               width: ${w}; min-width: ${w}; max-width: ${w}; ${displayStyle}">
                        <input type="text" class="column-filter" placeholder="Filter ${col}" data-col="${col}" 
                               value="${val}" style="width:100%; padding:2px; font-size:0.8em; border-radius:4px;">
                    </th>`;
            });
            tableHTML += `</tr></thead><tbody>`;

            // Data rows
            rows.forEach((rowData, idx) => {
                tableHTML += `<tr style="cursor:pointer;"><td style="position: sticky; left:0; background: #1a1a1a; z-index: 5; ${rowNumStyle}">${offset + idx + 1}</td>`;
                rowData.forEach((value, colIndex) => {
                    const colName = allColumns[colIndex];
                    const displayStyle = visibleColumns.has(colName) ? '' : 'display:none;';
                    let display = (value === null || value === undefined) ? '' : String(value);

                    // --- SPECIAL FORMATTING ---
                    if (colName === 'youtube_url' && display) {
                        display = `<a href="${display}" target="_blank" rel="noopener noreferrer" style="color:#00aaff; text-decoration:underline;">youtube</a>`;
                    } else {
                        if (damageTranslationDict && DAMAGE_TRANSLATION_COLS.has(colName)) {
                            const rawId = display;
                            const friendly = damageTranslationDict[rawId];
                            if (friendly && friendly !== rawId) {
                                display = `${rawId} <span style="color:#888;">(${friendly})</span>`;
                            }
                        }

                        display = display.replace(
                            /(https?:\/\/[^\s<>"']+)/gi,
                            '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00aaff; text-decoration:underline;">$1</a>'
                        );
                    }

                    const w = getColWidth(colName);
                    // Wrap content in a div with max-height to cap row vertical size
                    tableHTML += `
                        <td style="width: ${w}; min-width: ${w}; max-width: ${w}; ${displayStyle}">
                            <div style="max-height: 50px; overflow-y: auto;">${display}</div>
                        </td>`;
                });
                tableHTML += '</tr>';
            });
            tableHTML += '</tbody></table></div>';

            // ==================== PAGINATION (OUTSIDE SCROLL) ====================
            let paginationHTML = `
                <div style="margin-top: 20px; padding: 16px; background: #1f1f1f; border-radius: 8px; 
                            display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;
                            position: sticky; bottom: 0; z-index: 100; border-top: 1px solid #444;">
                    <div style="color: #ddd;">
                        <strong>Matching rows:</strong> ${totalMatching.toLocaleString()} 
                        <span style="margin-left: 20px; color: #aaa;">
                            Showing ${offset + 1} – ${Math.min(offset + rows.length, totalMatching)}
                        </span>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        ${hasPrevious ? `<button id="prev-btn" class="pagination-btn">← Previous ${PAGE_SIZE}</button>` : ''}
                        ${hasMore ? `<button id="next-btn" class="pagination-btn">Next ${PAGE_SIZE} →</button>` : ''}
                    </div>
                </div>
            `;

            container.innerHTML = columnSelectorHTML + tableHTML + paginationHTML;

            // Restore focus
            if (focusedCol) {
                const input = container.querySelector(`.column-filter[data-col="${focusedCol}"]`);
                if (input) {
                    input.focus();
                    if (cursorPos !== null) input.setSelectionRange(cursorPos, cursorPos);
                }
            }

            // ==================== EVENT LISTENERS ====================

            // Row click highlighting
            container.querySelectorAll('.sql-table tbody tr').forEach(row => {
                row.addEventListener('click', () => {
                    container.querySelectorAll('.sql-table tbody tr').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');
                });
            });

            // Toggle row numbers
            container.querySelector('#toggle-row-nums').addEventListener('change', (e) => {
                showRowNumbers = e.target.checked;
                renderCurrentPage(container, limit, filters, offset, visibleColumns);
            });

            // Show All / Reset buttons
            container.querySelector('.show-all-btn').addEventListener('click', () => {
                renderCurrentPage(container, limit, filters, offset, new Set(allColumns));
            });
            container.querySelector('.reset-cols-btn').addEventListener('click', () => {
                renderCurrentPage(container, limit, filters, offset, new Set(defaultVisibleColumns));
            });

            // Sortable headers
            container.querySelectorAll('.sortable-header').forEach(header => {
                header.addEventListener('click', () => {
                    const col = header.dataset.col;
                    if (currentSort === col) {
                        sortDirection = sortDirection === 'ASC' ? 'DESC' : 'ASC';
                    } else {
                        currentSort = col;
                        sortDirection = 'ASC';
                    }
                    currentOffset = 0; // Reset to page 1 on sort
                    renderCurrentPage(container, limit, filters, currentOffset, visibleColumns);
                });
            });

            // Column toggle checkboxes
            container.querySelectorAll('.col-toggle').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    const col = checkbox.dataset.col;
                    if (checkbox.checked) {
                        visibleColumns.add(col);
                    } else {
                        visibleColumns.delete(col);
                        delete filters[col];
                    }
                    renderCurrentPage(container, limit, filters, offset, visibleColumns);
                });
            });

            // Filter inputs
            container.querySelectorAll('.column-filter').forEach(input => {
                input.addEventListener('input', () => {
                    currentFilters[input.dataset.col] = input.value.trim();
                    currentOffset = 0;
                    renderCurrentPage(container, limit, currentFilters, currentOffset, visibleColumns);
                });
            });

            // Pagination
            const nextBtn = container.querySelector('#next-btn');
            if (nextBtn) nextBtn.addEventListener('click', () => {
                currentOffset += PAGE_SIZE;
                renderCurrentPage(container, limit, currentFilters, currentOffset, visibleColumns);
            });

            const prevBtn = container.querySelector('#prev-btn');
            if (prevBtn) prevBtn.addEventListener('click', () => {
                currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
                renderCurrentPage(container, limit, currentFilters, currentOffset, visibleColumns);
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = `<p style="padding:20px; color:#ff4444;">Error: ${e.message}</p>`;
        }
    }
}

// Create a table from a JSON object
function createTable(table, data) {
    const thead = table.createTHead();
    const tbody = table.createTBody();
    const headers = Object.keys(data[0] || {});

    // Create table headers
    const row = thead.insertRow();

    // Add a header for the row number
    const thRowNum = document.createElement('th');
    thRowNum.innerText = '#'; // Header for row numbers
    row.appendChild(thRowNum);

    headers.forEach(header => {
        const th = document.createElement('th');
        // rename at creation time
        if (header === 'twitch') th.innerText = 'source';
        else if (header === 'youtube') th.innerText = 'clips';
        else th.innerText = header;
        row.appendChild(th);
    });

    // Create table rows
    data.forEach((item, index) => { // Use index to keep track of the row number
        const row = tbody.insertRow();

        // Highlight the row if StillPlaying is true
        if (item && item.StillPlaying === true) {
            row.classList.add('row-highlight');
        }

        // Insert row number as the first cell
        const cellRowNum = row.insertCell();
        cellRowNum.innerText = index + 1; // Display the row number (1-based index)

        headers.forEach(header => {
            const cell = row.insertCell();

            if (header === 'twitch') {
                // item[header] may contain twitch OR youtube links — show appropriate label
                const links = (item[header] || []).map(link => {
                    let displayText;
                    if (typeof link === 'string' && link.includes("twitch.tv")) {
                        displayText = "twitch";
                    } else if (typeof link === 'string' && link.includes("youtube.com")) {
                        displayText = "youtube";
                    } else {
                        displayText = link; 
                    }
                    return `<a href="${link}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
                }).join('<br>'); // Use <br> for line breaks

                cell.innerHTML = links; // clickable links

            } else if (header === 'youtube') {
                // Create clickable YouTube links (array of dicts)
                const youtubeLinks = (item[header] || []).map(dict => {
                    const entry = Object.entries(dict || {})[0] || [];
                    const filename = entry[0] || '';
                    const url = entry[1] || '';
                    return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${filename}</a>` : '';
                }).join('<br>');
                cell.innerHTML = youtubeLinks; // Use innerHTML to allow clickable links
            } else {
                cell.innerText = item[header] !== undefined ? item[header] : '';
            }
        });
    });
}
