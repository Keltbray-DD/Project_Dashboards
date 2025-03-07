function exportTableToExcel(tableId, exportName) {
    // Get the table element
    console.log(1);
    const d = new Date().toLocaleString();
    console.log(2);
    // Create a new workbook object
    var workbook = XLSX.utils.book_new();
    console.log(3);
    // 1. Create Cover Sheet data
    var coverData = [
      [""],
      ["", `${exportName} Export`],
      [""],
      [
        "",
        `This report contains data related to ${projectName} and should be used appropriately`,
      ],
      [""],
      ["", "Generated on: " + d],
    ];
    console.log(4);
    // Convert cover data to worksheet
    var coverSheet = XLSX.utils.aoa_to_sheet(coverData);
    console.log(5);
  
    // Add the cover sheet to the workbook with a sheet name "Cover"
    XLSX.utils.book_append_sheet(workbook, coverSheet, "Cover");
    console.log(6);
    // 2. Add the Table Sheet
    var table = document.getElementById(tableId);
    console.log(7);
    // Convert the modified table data to a sheet
    var tableSheet = XLSX.utils.table_to_sheet(table);
    console.log(8);
    // Add the table sheet to the workbook with a sheet name "Data"
    XLSX.utils.book_append_sheet(workbook, tableSheet, "Data");
    console.log(9);
    // Use SheetJS to export the worksheet to an Excel file
    XLSX.writeFile(workbook, `${exportName}_${projectName}_${d}.xlsx`);
    console.log(10);
  }