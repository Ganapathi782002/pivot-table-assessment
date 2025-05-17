import React, { useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { utils, writeFile } from 'xlsx';

const GeneratingFields = () => {
  const { state } = useLocation();
  const { fullData } = state || {};

  const [rowFields, setRowFields] = useState([]); //Used to store array of row fields selected by user.
  const [columnFields, setColumnFields] = useState([]); //Used to store array of column fields selected by user.
  const [valueFields, setValueFields] = useState([]); // Array of { field: string, aggregation: string }
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [defaultAggregationType, setDefaultAggregationType] = useState("Sum"); //Default aggregation type for the value field.
  const pivotTableRef = useRef(null);

  if (!fullData || fullData.length < 2) {
    return <div>No data received or insufficient data</div>; //Checking if there is enough data to create Pivot table
  }

  const [headers, ...rows] = fullData; //Getting the full-data from Excel or CSV file.
  const structuredData = rows.map((row) => //Mapping accessing of values using column names instead of index.
    headers.reduce((acc, key, idx) => {
      acc[key] = row[idx];
      return acc;
    }, {})
  );

  const addField = (setFieldFn, currentFields, field) => { //Adds a selected field to the appropriate state array (rowFields, columnFields, or valueFields).
    if (!field) return;
    if (setFieldFn === setValueFields) {
      if (!currentFields.some(item => item.field === field)) {
        setFieldFn([...currentFields, { field: field, aggregation: defaultAggregationType }]);
        setSelectedValue("");
      }
    } else {
      if (!currentFields.includes(field)) {
        setFieldFn([...currentFields, field]);
      }
    }
  };

  const removeField = (fieldToRemove, setFieldFn, currentFields) => { //Removes a field from Row, Column or Value.
    if (setFieldFn === setValueFields) {
      setFieldFn(currentFields.filter((item) => item.field !== fieldToRemove));
    } else {
      setFieldFn(currentFields.filter((f) => f !== fieldToRemove));
    }
    if (setFieldFn === setRowFields) setSelectedRow("");
    else if (setFieldFn === setColumnFields) setSelectedColumn("");
    else if (setFieldFn === setValueFields) setSelectedValue("");
  };

  const renderFieldDropdown = ( //This function is used reused to render the drop-down in Row, Column and value fields.
    label,
    options,
    selected,
    setSelected,
    setFieldFn,
    currentFields,
    includeAggregation = false,
    aggregationTypeState = "",
    setAggregationTypeFn = () => {}
  ) => (
    <div style={styles.dropdownSection}>
      <label style={styles.label}>{label}</label>
      <select
        style={styles.select}
        value={selected || ""}
        onChange={(e) => {
          const field = e.target.value;
          setSelected(field);
          addField(setFieldFn, currentFields, field);
        }}
      >
        <option value="" disabled>Add a field</option>
        {options
          .filter(field => setFieldFn === setValueFields ? !currentFields.some(item => item.field === field) : !currentFields.includes(field))
          .map((field) => (
            <option key={field} value={field}>{field}</option>
          ))}
      </select>
      {includeAggregation && (
        <div style={styles.aggregationSection}>
          <label style={styles.label}>Default aggregation for new fields</label>
          <select
            style={styles.select}
            value={aggregationTypeState}
            onChange={(e) => setAggregationTypeFn(e.target.value)}
          >
            <option value="Sum">Sum</option>
            <option value="Average">Average</option>
            <option value="Count">Count</option>
          </select>
        </div>
      )}
      <div style={styles.selectedFieldsContainer}>
        {currentFields.map((item) => {
          const fieldName = setFieldFn === setValueFields ? item.field : item;
          const currentAggregation = setFieldFn === setValueFields ? item.aggregation : null;
          return (
            <div key={fieldName} style={styles.selectedField}>
              {fieldName}
              {setFieldFn === setValueFields && (
                <>
                  ({currentAggregation})
                  <select
                    style={{ ...styles.select, width: 'unset', marginLeft: '10px', padding: '2px', height: '25px', fontSize: '12px' }}
                    value={currentAggregation}
                    onChange={(e) => {
                      const newAggregation = e.target.value;
                      setValueFields(valueFields.map(valField =>
                        valField.field === fieldName ? { ...valField, aggregation: newAggregation } : valField
                      ));
                    }}
                  >
                    <option value="Sum">Sum</option>
                    <option value="Average">Average</option>
                    <option value="Count">Count</option>
                  </select>
                </>
              )}
              <button
                onClick={() => removeField(fieldName, setFieldFn, currentFields)}
                style={styles.removeButton}
              >X</button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const aggregateData = (data, rowFields, columnFields, valueFields) => { //This function is used to aggregate data when an user selects row and value field without column field.
    const dataMap = {};
    const DUMMY_COL_KEY = '__#NO_COLUMN_VALUES#__';

    data.forEach(item => {
      const rowKey = rowFields.length > 0 ? rowFields.map(field => item[field]).join(' | ') : 'Grand Total';
      const colKey = columnFields.length > 0 ? columnFields.map(field => item[field]).join(' | ') : DUMMY_COL_KEY;

      if (!dataMap[rowKey]) dataMap[rowKey] = {};
      if (!dataMap[rowKey][colKey]) dataMap[rowKey][colKey] = {};

      valueFields.forEach(({ field }) => {
        const fieldValue = parseFloat(item[field]); // Keep as NaN if not a number
        if (!dataMap[rowKey][colKey][field]) {
          dataMap[rowKey][colKey][field] = { sum: 0, count: 0, numericCount: 0 };
        }
        if (!isNaN(fieldValue)) {
            dataMap[rowKey][colKey][field].sum += fieldValue;
            dataMap[rowKey][colKey][field].numericCount++;
        }
        dataMap[rowKey][colKey][field].count++; // Counts all items in the group
      });
    });

    const getAggregatedValue = (sum, count, numericCount, aggregation) => {
      if (aggregation === 'Average') {
        return numericCount > 0 ? (sum / numericCount).toFixed(2) : '0.00'; //For calculating avaerage
      } else if (aggregation === 'Count') {
        return count; // Total items in group
      }
      return sum.toFixed(2); // Default is Sum
    };

    const result = [];
    const uniqueRowKeys = Object.keys(dataMap).sort(); // Sorting might need custom logic if 'Grand Total' needs specific placement beyond alphabetical

    let finalUniqueColKeys;
    if (columnFields.length > 0) {
        finalUniqueColKeys = Array.from(new Set(Object.values(dataMap).flatMap(row => Object.keys(row))))
            .filter(key => key !== 'Grand Total' && key !== DUMMY_COL_KEY) // Ensure DUMMY_COL_KEY isn't treated as a real column
            .sort();
    } else if (valueFields.length > 0) {
        finalUniqueColKeys = [DUMMY_COL_KEY];
    } else {
        finalUniqueColKeys = [];
    }


    uniqueRowKeys.forEach(rowKey => {
      const rowData = {};
      const rowKeyParts = rowKey.split(' | ');
      rowFields.forEach((field, index) => {
        rowData[field] = rowKeyParts[index];
      });

      finalUniqueColKeys.forEach(colKey => {
        valueFields.forEach(({ field, aggregation }) => {
          const cellData = dataMap[rowKey]?.[colKey]?.[field] || { sum: 0, count: 0, numericCount: 0 };
          const dataCellKey = columnFields.length > 0 ? `${colKey} - ${field} (${aggregation})` : `${field} (${aggregation})`;
          rowData[dataCellKey] = getAggregatedValue(cellData.sum, cellData.count, cellData.numericCount, aggregation);
        });
      });

      if (columnFields.length > 0) { // Row Grand Totals only if actual columns exist
        valueFields.forEach(({ field, aggregation }) => {
          let rowTotalSum = 0;
          let rowTotalCount = 0;
          let rowTotalNumericCount = 0;
          finalUniqueColKeys.forEach(colKeyForTotal => { // These are actual column keys
            const fieldData = dataMap[rowKey]?.[colKeyForTotal]?.[field] || { sum: 0, count: 0, numericCount: 0 };
            rowTotalSum += fieldData.sum;
            rowTotalCount += fieldData.count;
            rowTotalNumericCount += fieldData.numericCount;
          });
          rowData[`Grand Total - ${field} (${aggregation})`] = getAggregatedValue(rowTotalSum, rowTotalCount, rowTotalNumericCount, aggregation);
        });
      }
      result.push(rowData);
    });

    if (rowFields.length > 0 && valueFields.length > 0) { // Only add a separate grand total row if there are row fields and values
      const grandTotalRow = { _isGrandTotal: true };
      grandTotalRow[rowFields[0]] = 'Grand Total';
      rowFields.slice(1).forEach(field => grandTotalRow[field] = '');

      valueFields.forEach(({ field, aggregation }) => {
        let overallTotalSum = 0;
        let overallTotalCount = 0;
        let overallTotalNumericCount = 0;
        structuredData.forEach(item => {
          const fieldValue = parseFloat(item[field]);
          if(!isNaN(fieldValue)){
            overallTotalSum += fieldValue;
            overallTotalNumericCount++;
          }
          overallTotalCount++;
        });
        const aggregatedValue = getAggregatedValue(overallTotalSum, overallTotalCount, overallTotalNumericCount, aggregation);
        const keySuffix = `${field} (${aggregation})`;
        grandTotalRow[columnFields.length > 0 ? `Grand Total - ${keySuffix}` : keySuffix] = aggregatedValue;
      });

      if (columnFields.length > 0) {
        finalUniqueColKeys.forEach(colKey => {
          valueFields.forEach(({ field, aggregation }) => {
            let colTotalSum = 0;
            let colTotalCount = 0;
            let colTotalNumericCount = 0;
            structuredData.forEach(sItem => {
              const itemColKey = columnFields.map(cf => sItem[cf]).join(' | ');
              if (itemColKey === colKey) {
                const val = parseFloat(sItem[field]);
                if(!isNaN(val)){
                    colTotalSum += val;
                    colTotalNumericCount++;
                }
                colTotalCount++;
              }
            });
            grandTotalRow[`${colKey} - ${field} (${aggregation})`] = getAggregatedValue(colTotalSum, colTotalCount, colTotalNumericCount, aggregation);
          });
        });
      }
      result.push(grandTotalRow);
    } else if (rowFields.length === 0 && result.length > 0 && result[0] && valueFields.length > 0) {
      // If no rowFields, the single row in 'result' is the grand total row. Mark it.
      result[0]._isGrandTotal = true;
      // It already contains the overall values if no columns. If columns, add column totals and overall total column.
      if (columnFields.length > 0) {
        const gtRow = result[0]; // This is the 'Grand Total' rowKey row
        finalUniqueColKeys.forEach(colKey => {
            valueFields.forEach(({ field, aggregation }) => {
                 // Column totals are already in gtRow from the main loop for 'Grand Total' rowKey
                 // Ensure the key format is consistent if it was missed
                 const dataCellKey = `${colKey} - ${field} (${aggregation})`;
                 if (!gtRow[dataCellKey]) { // Should be there, but as a fallback
                    let colTotalSum = 0;
                    let colTotalCount = 0;
                    let colTotalNumericCount = 0;
                    structuredData.forEach(sItem => {
                        const itemColKey = columnFields.map(cf => sItem[cf]).join(' | ');
                        if (itemColKey === colKey) {
                            const val = parseFloat(sItem[field]);
                             if(!isNaN(val)){
                                colTotalSum += val;
                                colTotalNumericCount++;
                            }
                            colTotalCount++;
                        }
                    });
                    gtRow[dataCellKey] = getAggregatedValue(colTotalSum, colTotalCount, colTotalNumericCount, aggregation);
                 }
            });
        });
        // Ensure the "overall" grand total (for the Grand Total column) is present
        valueFields.forEach(({ field, aggregation }) => {
            let overallTotalSum = 0;
            let overallTotalCount = 0;
            let overallTotalNumericCount = 0;
            structuredData.forEach(sItem => {
                const val = parseFloat(sItem[field]);
                 if(!isNaN(val)){
                    overallTotalSum += val;
                    overallTotalNumericCount++;
                }
                overallTotalCount++;
            });
            gtRow[`Grand Total - ${field} (${aggregation})`] = getAggregatedValue(overallTotalSum, overallTotalCount,overallTotalNumericCount, aggregation);
        });
      }
    }
    return { result, uniqueColKeys: finalUniqueColKeys, DUMMY_COL_KEY };
  };

  const getLowerLevelCombinationsCount = (parentColKey, currentLevel, remainingColFields, data, allColumnFields) => {
    if (remainingColFields.length === 0) return 1;
    const nextField = remainingColFields[0];
    const uniqueValues = Array.from(new Set(data.map(item => {
      const currentItemKeyParts = allColumnFields.slice(0, currentLevel + 1).map(f => item[f]);
      const currentItemKey = currentItemKeyParts.join(' | ');
      // Check if currentItemKey starts with parentColKey (or matches if parentColKey is empty)
      const parentPrefix = parentColKey ? parentColKey + ' | ' : '';
      if (parentColKey === '' || currentItemKey.startsWith(parentPrefix) || currentItemKey === parentColKey) {
          // If parentColKey matches up to the previous level, extract the value for the current nextField
          if (allColumnFields.slice(0, currentLevel).map(f => item[f]).join(' | ') === parentColKey || parentColKey === '') {
            return item[nextField];
          }
      }
      return null;
    }).filter(val => val !== null)));

    let count = 0;
    if (uniqueValues.length === 0 && remainingColFields.length > 0) return 0; // No combinations if no unique values at this level
    if (uniqueValues.length === 0 && remainingColFields.length === 0) return 1;


    uniqueValues.forEach(val => {
      const nextParentKey = parentColKey ? `${parentColKey} | ${val}` : val;
      count += getLowerLevelCombinationsCount(nextParentKey, currentLevel + 1, remainingColFields.slice(1), data, allColumnFields);
    });
    return count || 1; // Ensure at least 1 if there were unique values but no further levels
  };


  const getTableHeader = (rowFields, columnFields, valueFields, uniqueColKeysFromAgg, data, DUMMY_COL_KEY) => {
    const headerRows = [];
    let totalHeaderLevels;

    if (columnFields.length > 0) {
        totalHeaderLevels = columnFields.length + (valueFields.length > 0 ? 1 : 0);
    } else {
        totalHeaderLevels = 1; // For the single row of headers (row field names + value field names)
    }

    for (let i = 0; i < totalHeaderLevels; i++) {
        headerRows.push([]);
    }

    if (rowFields.length > 0) {
        if (headerRows[0]) {
            headerRows[0].push({ text: rowFields.join(' | '), colspan: rowFields.length, rowspan: totalHeaderLevels, type: 'row-fields-header' });
        }
    } else if (valueFields.length > 0 || columnFields.length > 0) { // No rowFields
        let text = '';
        // If only values, or only columns (or cols+vals), this is the top-left corner.
        if (columnFields.length === 0 && valueFields.length > 0) text = 'Values'; // Label for the single (Grand Total) row's values
        else if (columnFields.length > 0 ) text = ''; // Empty top-left above column headers

        if (headerRows.length > 0 && headerRows[0] && text) { // Add if text is meaningful
             headerRows[0].push({ text: text, colspan: 1, rowspan: totalHeaderLevels, type: 'corner-label' });
        } else if (headerRows.length > 0 && headerRows[0] && columnFields.length === 0 && valueFields.length === 0 && rowFields.length === 0){
            // Case: absolutely nothing selected, but table header might be called.
        } else if (headerRows.length > 0 && headerRows[0] && !text && columnFields.length > 0){ // empty top left when no row fields but col fields exist
             headerRows[0].push({ text: '', colspan: 1, rowspan: totalHeaderLevels, type: 'corner-label' });
        }
    }


    if (columnFields.length > 0) {
        const populateColHeaders = (currentLevel, parentColKey = '') => {
            if (currentLevel >= columnFields.length) return;
            const field = columnFields[currentLevel];
            const uniqueValuesForLevel = Array.from(new Set(data.map(item => {
                const itemParentKey = columnFields.slice(0, currentLevel).map(f => item[f]).join(' | ');
                if (parentColKey === itemParentKey) return item[field];
                return null;
            }).filter(val => val !== null))).sort();


            uniqueValuesForLevel.forEach(val => {
                const currentColKey = parentColKey ? `${parentColKey} | ${val}` : val;
                let colspan = 0;
                if (currentLevel === columnFields.length - 1) { // Last level of column fields
                    colspan = Math.max(1, valueFields.length); // Each last level col header spans the value fields under it
                } else {
                    const remainingColFields = columnFields.slice(currentLevel + 1);
                    const lowerLevelCombinations = getLowerLevelCombinationsCount(currentColKey, currentLevel + 1, remainingColFields, data, columnFields);
                    colspan = lowerLevelCombinations * Math.max(1, valueFields.length);
                }

                if (headerRows[currentLevel]) {
                    headerRows[currentLevel].push({ text: val, colspan: colspan, rowspan: 1, type: 'column-group', level: currentLevel });
                }
                populateColHeaders(currentLevel + 1, currentColKey);
            });
        };
        populateColHeaders(0);

        if (valueFields.length > 0) {
            const valueHeaderRowIndex = columnFields.length;
            if (headerRows[valueHeaderRowIndex]) {
                uniqueColKeysFromAgg.forEach(colKey => { // These are the actual full column keys
                    if (colKey !== DUMMY_COL_KEY) { // Skip dummy key if it appears
                        valueFields.forEach(({ field, aggregation }) => {
                            headerRows[valueHeaderRowIndex].push({ text: `${field} (${aggregation})`, colspan: 1, rowspan: 1, type: 'value' });
                        });
                    }
                });
            }
        }
    } else if (valueFields.length > 0) { // No column fields, only value fields
        const valueHeaderRowIndex = 0;
        if (headerRows[valueHeaderRowIndex]) {
            valueFields.forEach(({ field, aggregation }) => {
                headerRows[valueHeaderRowIndex].push({ text: `${field} (${aggregation})`, colspan: 1, rowspan: 1, type: 'value' });
            });
        }
    }

    // Grand Total column header (for row totals)
    if (valueFields.length > 0 && columnFields.length > 0) {
        const grandTotalColspan = valueFields.length;
        const targetHeaderRowIndexForGT = columnFields.length; // Aligns with value headers under columns
         if (headerRows[targetHeaderRowIndexForGT]) {
            headerRows[targetHeaderRowIndexForGT].push({ text: 'Grand Total', colspan: grandTotalColspan, rowspan: 1, type: 'grand-total-column-header' });
        }
    }
    return headerRows.filter(row => row.length > 0);
  };


  const shouldDisplayRowField = (data, rowIndex, rowField, allRowFields) => {
    if (rowIndex < 0 || rowIndex >= data.length || data[rowIndex]._isGrandTotal) return true; // GT always displays its first cell
    if (rowIndex === 0) return true;
    const currentFieldLevel = allRowFields.indexOf(rowField);
    if (currentFieldLevel === -1) return true;
    const currentGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[rowIndex][f]).join('|');
    const previousGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[rowIndex - 1][f]).join('|');
    return currentGroupValues !== previousGroupValues;
  };

  const getRowspanForRowField = (data, rowIndex, rowField, allRowFields) => {
    if (rowIndex < 0 || rowIndex >= data.length || data[rowIndex]._isGrandTotal) return 1;
    const currentFieldLevel = allRowFields.indexOf(rowField);
    if (currentFieldLevel === -1) return 1;
    let rowspan = 0;
    const currentGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[rowIndex][f]).join('|');
    for (let i = rowIndex; i < data.length; i++) {
      if(data[i]._isGrandTotal) break; // Don't span into grand total row
      const currentRowGroupValues = allRowFields.slice(0, currentFieldLevel + 1).map(f => data[i][f]).join('|');
      if (currentRowGroupValues === currentGroupValues) {
        rowspan++;
      } else {
        break;
      }
    }
    return rowspan > 0 ? rowspan : 1;
  };

  const { result, uniqueColKeys, DUMMY_COL_KEY } = aggregateData(structuredData, rowFields, columnFields, valueFields);
  const tableHeader = getTableHeader(rowFields, columnFields, valueFields, uniqueColKeys, structuredData, DUMMY_COL_KEY);
  const showTable = rowFields.length > 0 || columnFields.length > 0 || valueFields.length > 0;

  const downloadExcel = () => {
    if (!pivotTableRef.current) return;
    const wb = utils.book_new();
    const ws = utils.table_to_sheet(pivotTableRef.current);
    utils.book_append_sheet(wb, ws, "Pivot Table");
    writeFile(wb, "pivot_table.xlsx");
  };

  //Core logic for creating the Pivot table
  return (
    <div style={styles.container}>
      <div style={styles.pivotContainer}>
        <h2 style={styles.pivotTablePlaceholder}>PIVOT TABLE</h2>
        {showTable && valueFields.length > 0 ? (
          <>
            {result.length === 0 && (rowFields.length > 0 || columnFields.length > 0) ? (
              <div style={styles.placeholderMessage}>No data to display for the selected fields.</div>
            ) : (
              <table style={styles.pivotTable} ref={pivotTableRef}>
                <thead>
                  {tableHeader.map((headerRow, rowIndex) => (
                    <tr key={`header-row-${rowIndex}`}>
                      {headerRow.map((headerCell, cellIndex) => (
                        <th
                          key={`header-cell-${rowIndex}-${cellIndex}`}
                          style={styles.tableHeader}
                          colSpan={headerCell.colspan || 1}
                          rowSpan={headerCell.rowspan || 1}
                        >
                          {headerCell.text}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {result.map((row, rowIndex) => {
                    const isGrandTotalRow = row._isGrandTotal === true;
                    const rowStyle = isGrandTotalRow ? styles.tableRowGrand : styles.tableRow;
                    return (
                      <tr key={`data-row-${rowIndex}`} style={rowStyle}>
                        {rowFields.map((rowField, rowFieldIndex) => {
                          if (isGrandTotalRow) {
                            if (rowFieldIndex === 0) {
                              return (
                                <td key={`row-${rowIndex}-label`} style={styles.tableCellGrand} colSpan={rowFields.length || 1}>
                                  Grand Total
                                </td>
                              );
                            } else {
                              return null;
                            }
                          }
                          const displayCell = shouldDisplayRowField(result, rowIndex, rowField, rowFields);
                          const rowspan = getRowspanForRowField(result, rowIndex, rowField, rowFields);
                          if (displayCell) {
                            return (
                              <td key={`row-${rowIndex}-field-${rowFieldIndex}`} style={styles.tableCell} rowSpan={rowspan}>
                                {row[rowField]}
                              </td>
                            );
                          } else {
                            return null;
                          }
                        })}
                        {!rowFields.length && isGrandTotalRow && (
                          <td key={`row-${rowIndex}-grandtotal-label`} style={styles.tableCellGrand}>
                            Grand Total
                          </td>
                        )}

                        {(columnFields.length > 0 ? uniqueColKeys.filter(ck => ck !== DUMMY_COL_KEY) : (valueFields.length > 0 ? [DUMMY_COL_KEY] : [])).map(colKeyOrDummy => (
                          valueFields.map(valueField => {
                            const dataKey = columnFields.length > 0
                              ? `${colKeyOrDummy} - ${valueField.field} (${valueField.aggregation})`
                              : `${valueField.field} (${valueField.aggregation})`;
                            return (
                              <td key={`cell-${rowIndex}-${colKeyOrDummy}-${valueField.field}`} style={isGrandTotalRow ? styles.tableCellGrand : styles.tableCell}>
                                {row[dataKey] || (valueField.aggregation === 'Count' ? '0' : '0.00')}
                              </td>
                            );
                          })
                        ))}

                        {valueFields.length > 0 && columnFields.length > 0 && (
                          valueFields.map(valueField => {
                            const grandTotalDataKey = `Grand Total - ${valueField.field} (${valueField.aggregation})`;
                            return (
                              <td key={`grand-total-col-${rowIndex}-${valueField.field}`} style={isGrandTotalRow ? styles.tableCellGrand : styles.tableCell}>
                                {row[grandTotalDataKey] || (valueField.aggregation === 'Count' ? '0' : '0.00')}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <button style={styles.downloadButton} onClick={downloadExcel}> 
              Download as Excel
            </button>
          </>
        ) : (
          <div style={styles.placeholderMessage}>
            <h2 style={styles.placeholderMessage}>To Construct a Pivot table</h2>
            Select at least one field in Value. Selecting fields in Row or Column will provide more detailed analysis.
          </div>
        )}
      </div>
      <div style={styles.selectorPane}>
        {renderFieldDropdown("Row Fields", headers, selectedRow, setSelectedRow, setRowFields, rowFields)}
        {renderFieldDropdown("Column Fields", headers, selectedColumn, setSelectedColumn, setColumnFields, columnFields)}
        {renderFieldDropdown("Value Fields", headers, selectedValue, setSelectedValue, setValueFields, valueFields, true, defaultAggregationType, setDefaultAggregationType)}
      </div>
    </div>
  );
};

//Applying styles for my Pivot table
const styles = {
  container: {
    display: "flex",
    height: "100vh",
    width: "100%",
    backgroundColor: "#e0f7fa",
    overflow: "hidden",
  },
  pivotContainer: {
    flex: 1,
    padding: "20px",
    overflow: "auto",
    backgroundColor: "#fff",
    position: "relative",
  },
  pivotTablePlaceholder: {
    textAlign: "center",
    fontSize: "18px",
    color: "#888",
  },
  selectorPane: {
    width: "280px",
    padding: "20px",
    backgroundColor: "skyblue",
    borderLeft: "1px solid #ccc",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflowY: "auto",
  },
  dropdownSection: {
    marginBottom: "20px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "bold",
    marginBottom: "8px",
    color: "#333",
  },
  select: {
    width: "100%",
    padding: "8px",
    fontSize: "14px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  },
  selectedFieldsContainer: {
    marginTop: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  selectedField: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: 'center',
    backgroundColor: "White",
    padding: "4px 8px",
    borderRadius: "10px",
    fontSize: "14px",
    color: "Black",
  },
  removeButton: {
    background: "red",
    color: "white",
    border: "none",
    borderRadius: "12px",
    padding: "2px 6px",
    cursor: "pointer",
    fontSize: "10px",
    marginLeft: "5px",
  },
  pivotTable: {
    width: "100%",
    borderCollapse: "collapse",
    backgroundColor: "#fff",
    fontSize: "13px",
    marginTop: "20px",
  },
  tableHeader: {
    border: "1px solid #ccc",
    padding: "8px",
    backgroundColor: "#f0f0f0",
    textAlign: "center",
    fontWeight: "bold",
    whiteSpace: "nowrap", // Prevent header text wrapping
  },
  tableRow: {
    border: "1px solid #ccc",
  },
  tableRowGrand: {
    border: "1px solid #ccc",
    fontWeight: "bold",
    backgroundColor: "#f0f0f0",
  },
  tableCell: {
    border: "1px solid #ccc",
    padding: "8px",
    textAlign: "center",
  },
  tableCellGrand: {
    border: "1px solid #ccc",
    padding: "8px",
    textAlign: "center",
    fontWeight: "bold",
    backgroundColor: "#f0f0f0",
  },
  placeholderMessage: {
    textAlign: "center",
    fontSize: "16px",
    color: "#888",
    paddingTop: "40px",
  },
  aggregationSection: {
    marginTop: "15px",
  },
  downloadButton: {
    backgroundColor: "#4CAF50",
    color: "white",
    padding: "10px 15px",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "14px",
    marginTop: "20px",
    alignSelf: "flex-start",
  },
};

export default GeneratingFields;