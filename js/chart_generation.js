async function chartChecks(item) {
    // if (selectedTab == "DrawingRegister" && item.form != "DR") {
    //   return;
    // }
    // console.log(item)
    if (isMissing(item.title_line_1)) {
      titleLineMissingCount++;
    } else {
      titleLinePresentCount++;
    }
    if (isMissing(item.revision)) {
      revisionMissingCount++;
    } else if (!pattern.test(item.revision)) {
      //console.log(item['revision'])
      revisionFormatCheckInvaildCount++;
    } else {
      revisionPresentCount++;
    }
    if (isMissing(item.file_description)) {
      descriptionMissingCount++;
    } else if (item.file_description == "TIDP Placeholder File") {
      descriptionPlaceHolderCount++;
    } else {
      descriptionPresentCount++;
    }
    if (isMissing(item.status)) {
      statusMissingCount++;
    } else {
      statusPresentCount++;
    }
  
    // Ensure the status field exists and is properly accessed
    const status = item.status;
    if (status) {
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    } else {
      // Handle cases where the status might be missing
      statusCounts["Missing"] = (statusCounts["Missing"] || 0) + 1;
    }
  }

  async function generateCharts() {
    // Create the pie chart to show Title Line 1 data presence
    const ctx_Title = document
      .getElementById("missingTitleDataChart")
      .getContext("2d");
    const chartData_Title = {
      labels: ["Files with Title Line 1", "Files without Title Line 1"],
      datasets: [
        {
          data: [titleLinePresentCount, titleLineMissingCount],
          backgroundColor: ["rgba(46, 204, 113, 0.6)", "rgba(255, 99, 132, 0.6)"],
          borderColor: ["rgba(46, 204, 113, 1)", "rgba(255, 99, 132, 1)"],
          borderWidth: 1,
        },
      ],
    };
    if (missingTitleDataChart) {
      missingTitleDataChart.destroy();
    }
    missingTitleDataChart = new Chart(ctx_Title, {
      id: 0,
      type: "pie",
      data: chartData_Title,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
            datalabels: {
              formatter: (value, ctx) => {
                const total = ctx.chart.data.datasets[0].data.reduce(
                  (a, b) => a + b,
                  0
                );
                const percentage = ((value / total) * 100).toFixed(2) + "%";
                return percentage;
              },
              color: "#fff",
            },
          },
        },
        onClick: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const index = activeElements[0].index;
            const field = "title_line_1";
            const label = chartData_Title.labels[index];
  
            filterTable(label);
          }
        },
      },
    });
  
    // Create the pie chart to show Title Line 1 data presence
    const ctx_Revision = document
      .getElementById("missingRevisionDataChart")
      .getContext("2d");
    const chartData_Revision = {
      labels: [
        "Files with Revision",
        "Files without Revision",
        "Files with Invalid ISO Revision",
      ],
      datasets: [
        {
          data: [
            revisionPresentCount,
            revisionMissingCount,
            revisionFormatCheckInvaildCount,
          ],
          backgroundColor: [
            "rgba(46, 204, 113, 0.6)",
            "rgba(255, 99, 132, 0.6)",
            "rgba(255, 219, 187, 0.6)",
          ],
          borderColor: [
            "rgba(46, 204, 113, 1)",
            "rgba(255, 99, 132, 1)",
            "rgba(255, 219, 187, 1)",
          ],
          borderWidth: 1,
        },
      ],
    };
  
    if (missingRevisionDataChart) {
      missingRevisionDataChart.destroy();
    }
  
    missingRevisionDataChart = new Chart(ctx_Revision, {
      id: 1,
      type: "pie",
      data: chartData_Revision,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
          },
          datalabels: {
            formatter: (value, ctx) => {
              const total = ctx.chart.data.datasets[0].data.reduce(
                (a, b) => a + b,
                0
              );
              const percentage = ((value / total) * 100).toFixed(2) + "%";
              return percentage;
            },
            color: "#000",
          },
        },
        onClick: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const index = activeElements[0].index;
            const field = "revision";
            const label = chartData_Revision.labels[index];
  
            filterTable(label);
          }
        },
      },
    });
  
    // Create the pie chart to show Title Line 1 data presence
    const ctx_Status = document
      .getElementById("missingStatusDataChart")
      .getContext("2d");
    const chartData_Status = {
      labels: ["Files with Status", "Files without Status"],
      datasets: [
        {
          data: [statusPresentCount, statusMissingCount],
          backgroundColor: ["rgba(46, 204, 113, 0.6)", "rgba(255, 99, 132, 0.6)"],
          borderColor: ["rgba(46, 204, 113, 1)", "rgba(255, 99, 132, 1)"],
          borderWidth: 1,
        },
      ],
    };
  
    if (missingStatusDataChart) {
      missingStatusDataChart.destroy();
    }
  
    missingStatusDataChart = new Chart(ctx_Status, {
      id: 1,
      type: "pie",
      data: chartData_Status,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
            datalabels: {
              formatter: (value, ctx) => {
                const total = ctx.chart.data.datasets[0].data.reduce(
                  (a, b) => a + b,
                  0
                );
                const percentage = ((value / total) * 100).toFixed(2) + "%";
                return percentage;
              },
              color: "#fff",
            },
          },
        },
        onClick: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const index = activeElements[0].index;
            const field = "status";
            const label = chartData_Status.labels[index];
  
            filterTable(label);
          }
        },
      },
    });
    // Create the bar chart to show Status data presence
    // Create the pie chart to show Title Line 1 data presence
    const ctx_Description = document
      .getElementById("missingDescriptionDataChart")
      .getContext("2d");
    const chartData_Description = {
      labels: [
        "Files with Description",
        "Files without Description",
        "Files with Placeholder Description",
      ],
      datasets: [
        {
          data: [
            descriptionPresentCount,
            descriptionMissingCount,
            descriptionPlaceHolderCount,
          ],
          backgroundColor: [
            "rgba(46, 204, 113, 0.6)",
            "rgba(255, 99, 132, 0.6)",
            "rgba(255, 219, 187, 0.6)",
          ],
          borderColor: [
            "rgba(46, 204, 113, 1)",
            "rgba(255, 99, 132, 1)",
            "rgba(255, 219, 187, 1)",
          ],
          borderWidth: 1,
        },
      ],
    };
  
    if (missingDescriptionDataChart) {
      missingDescriptionDataChart.destroy();
    }
  
    missingDescriptionDataChart = new Chart(ctx_Description, {
      id: 1,
      type: "pie",
      data: chartData_Description,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
            datalabels: {
              formatter: (value, ctx) => {
                const total = ctx.chart.data.datasets[0].data.reduce(
                  (a, b) => a + b,
                  0
                );
                const percentage = ((value / total) * 100).toFixed(2) + "%";
                return percentage;
              },
              color: "#fff",
            },
          },
        },
        onClick: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const index = activeElements[0].index;
            const field = "description";
            const label = chartData_Description.labels[index];
  
            filterTable(label);
          }
        },
      },
    });
    // Generate colors with red for "Unknown"
    const labels = Object.keys(statusCounts);
    const backgroundColors = labels.map((label) =>
      label === "Missing" ? "rgba(255, 99, 132, 0.6)" : "rgba(93, 173, 226, 0.6)"
    );
    const borderColors = labels.map((label) =>
      label === "Missing" ? "rgba(255, 99, 132, 1)" : "rgba(93, 173, 226, 1)"
    );
  
    const ctx_statusCount = document
      .getElementById("StatusDataChart")
      .getContext("2d");
    const chartData_statusCount = {
      labels: Object.keys(statusCounts),
      datasets: [
        {
          label: "Number of Files",
          data: Object.values(statusCounts),
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    };
  
    if (statusChart) {
      statusChart.destroy();
    }
  
    statusChart = new Chart(ctx_statusCount, {
      type: "bar",
      data: chartData_statusCount,
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of Files",
            },
          },
          x: {
            title: {
              display: false,
              text: "Status",
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          datalabels: {
            anchor: "end",
            align: "end",
            formatter: (value) => value,
            color: "#000",
          },
        },
        onClick: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const index = activeElements[0].index;
            const field = "statusBar";
            const label = chartData_statusCount.labels[index];
  
            filterTable(label, field);
          }
        },
      },
    });
  
    // Generate colors with red for "Unknown"
    const ctx_folders_Count = document
      .getElementById("folderDataChart")
      .getContext("2d");
    const chartData_folders_Count = {
      labels: Object.keys(folderCount),
      datasets: [
        {
          label: "Number of Files",
          data: Object.values(folderCount),
          backgroundColor: [
            "rgba(247, 220, 111, 0.6)",
            "rgba(133, 193, 233, 0.6)",
            "rgba(165, 105, 189, 0.6)",
            "rgba(205, 97, 85, 0.6)",
          ],
          borderColor: [
            "rgba(247, 220, 111, 1)",
            "rgba(133, 193, 233, 1)",
            "rgba(165, 105, 189, 1)",
            "rgba(205, 97, 85, 1)",
          ],
          borderWidth: 1,
        },
      ],
    };
  
    if (folders_Chart) {
      folders_Chart.destroy();
    }
  
    folders_Chart = new Chart(ctx_folders_Count, {
      type: "bar",
      data: chartData_folders_Count,
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of Files",
            },
          },
          x: {
            title: {
              display: false,
              text: "Status",
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          datalabels: {
            anchor: "end",
            align: "end",
            formatter: (value) => value,
            color: "#000",
          },
        },
        onClick: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const index = activeElements[0].index;
            const field = "folderBar";
            const label = chartData_folders_Count.labels[index];
  
            filterTable(label, field);
          }
        },
      },
    });
  }

  function gaugeDisplay(
    element,
    title,
    percentageValue,
    total,
    invert,
    percentageRequired
  ) {
    let colourSteps;
    if (!invert) {
      colourSteps = [
        { range: [0, total * 0.2], color: "rgba(207,32,32,0.5)" },
        { range: [total * 0.2, total * 0.4], color: "rgba(247,100,32,0.5)" },
        { range: [total * 0.4, total * 0.6], color: "rgba(255,187,16,0.5)" },
        { range: [total * 0.6, total * 0.8], color: "rgba(207,223,40,0.5)" },
        { range: [total * 0.8, total], color: "rgba(66,183,74,0.5)" },
      ];
    } else {
      colourSteps = [
        { range: [0, total * 0.2], color: "rgba(66,183,74,0.5)" },
        { range: [total * 0.2, total * 0.4], color: "rgba(207,223,40,0.5)" },
        { range: [total * 0.4, total * 0.6], color: "rgba(255,187,16,0.5)" },
        { range: [total * 0.6, total * 0.8], color: "rgba(247,100,32,0.5)" },
        { range: [total * 0.8, total], color: "rgba(207,32,32,0.5)" },
      ];
    }
    if (percentageRequired) {
      symbol = "%";
    }
    var data = [
      {
        domain: { x: [0, 1], y: [0, 1] },
        value: percentageValue,
        title: { text: title },
        type: "indicator",
        mode: "gauge+number",
        gauge: {
          axis: { range: [null, total], tickwidth: 1, tickcolor: "darkblue" },
          bar: { color: "rgba(65,105,225,0.8)" },
          bordercolor: "",
          borderwidth: 0,
          steps: colourSteps,
        },
      },
    ];
  
    var layout = {
      width: "100%",
      height: 150,
      // Position the chart title using annotation at the bottom
      annotations: [
        {
          text: title,
          xref: "paper",
          yref: "paper",
          x: 0.5, // Center it horizontally
          y: -0.3, // Position it below the chart
          showarrow: false,
          font: {
            size: 16,
            color: "black",
          },
        },
      ],
      margin: { t: 20, b: 30 },
    };
  
    Plotly.newPlot(element, data, layout);
  }

  function newGaugeChartdata(
    elementVar,
    element,
    title,
    score,
    max,
    total,
    percentage,
    colourInvert
  ) {
    const ctx_render = document.getElementById(element).getContext("2d");
    if (elementVar) {
      elementVar.destroy();
    }
    // setup
    // Boundaries are <= so that exactly 100% (score/(score+max) === 1)
    // lands in the top bucket (green for non-invert, red for invert)
    // rather than spilling into the catch-all "error" colour below.
    if (colourInvert) {
      if (score / (score + max) < 0.2) {
        backC = ["rgba(66,183,74,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(66,183,74, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) < 0.4) {
        backC = ["rgba(207,223,40,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(207,223,40, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) < 0.6) {
        backC = ["rgba(255,187,16,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(255,187,16, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) < 0.8) {
        backC = ["rgba(247,100,32,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(247,100,32, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) <= 1) {
        backC = ["rgba(207,32,32,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(207,32,32, 1)", "rgba(0, 0, 0, 0.3)"];
      } else {
        backC = ["rgba(255, 26, 104, 0.2)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(255, 26, 104, 1)", "rgba(0, 0, 0, 1)"];
      }
    } else {
      if (score / (score + max) < 0.2) {
        backC = ["rgba(207,32,32,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(207,32,32, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) < 0.4) {
        backC = ["rgba(247,100,32,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(247,100,32, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) < 0.6) {
        backC = ["rgba(255,187,16,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(255,187,16, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) < 0.8) {
        backC = ["rgba(207,223,40,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(207,223,40, 1)", "rgba(0, 0, 0, 0.3)"];
      } else if (score / (score + max) <= 1) {
        backC = ["rgba(66,183,74,0.5)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(66,183,74, 1)", "rgba(0, 0, 0, 0.3)"];
      } else {
        backC = ["rgba(255, 26, 104, 0.2)", "rgba(0, 0, 0, 0.2)"];
        borderC = ["rgba(255, 26, 104, 1)", "rgba(0, 0, 0, 1)"];
      }
    }
  
    const data = {
      labels: ["Mon", "Tue"],
      datasets: [
        {
          data: [score, max],
          backgroundColor: backC,
          borderColor: borderC,
          borderWidth: 1,
          cutout: "90%",
          circumference: 180,
          rotation: 270,
        },
      ],
    };
  
    const gaugeChartText = {
      id: "gaugeChartText",
      afterDatasetsDraw(chart, args, pluginOptions) {
        const {
          ctx,
          data,
          chartArea: { top, bottom, left, right, width, height },
          scales: { r },
        } = chart;
  
        ctx.save();
        const xCoor = chart.getDatasetMeta(0).data[0].x;
        const yCoor = chart.getDatasetMeta(0).data[0].y;
  
        function textLabel(
          fontSize,
          color,
          textBaseLine,
          textAlign,
          textValue,
          x,
          y
        ) {
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = color;
          ctx.textBaseLine = textBaseLine;
          ctx.textAlign = textAlign;
          ctx.fillText(textValue, x, y);
        }
        textLabel(14, "#666", "bottom", "left", 0, left, yCoor + 20);
        textLabel(14, "#666", "bottom", "right", total, right, yCoor + 20);
        if (percentage) {
          textLabel(50, "#666", "bottom", "center", `${score}%`, xCoor, yCoor);
        } else {
          textLabel(60, "#666", "bottom", "center", score, xCoor, yCoor);
        }
        textLabel(18, "#666", "bottom", "center", title, xCoor, yCoor + 20);
      },
    };
  
    // config
    const config = {
      type: "doughnut",
      data: data,
      options: {
        maintainAspectRatio: true, // Maintain default aspect ratio
        responsive: true, // Make it responsive
        aspectRatio: 1.5, // Set specific aspect ratio if needed
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: false,
          },
        },
      },
      plugins: [gaugeChartText],
    };
  
    // render init block
    const myChart = new Chart(ctx_render, config);
    return myChart;
  }