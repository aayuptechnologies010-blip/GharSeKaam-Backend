import { prisma } from './config/prismaConfig.js';

const FALLBACK_PRODUCTS = [
  {
    id: "drill-001",
    title: "Bosch GSB 500 RE Professional Impact Drill Machine",
    retailprice: 2499,
    wholesaleprice: 2199,
    images: ["https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Tools & Safety Equipments",
    unit: "PIECE",
    currentQty: 150,
    description: "The Bosch GSB 500 RE is a powerful, compact, and reliable impact drill machine.",
    variants: [
      { size: "500W Standard", price: 2499 },
      { size: "600W Heavy Duty", price: 2999 }
    ]
  },
  {
    id: "cement-001",
    title: "Ultratech Premium Portland Pozzolana Cement (PPC)",
    retailprice: 375,
    wholesaleprice: 350,
    images: ["https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Building Material (Cement, Sand, Iron)",
    unit: "KG",
    currentQty: 500,
    description: "Ultratech Premium is a concrete-specialist Portland Pozzolana Cement.",
    variants: [
      { size: "50kg Bag", price: 375 },
      { size: "1 Ton Bundle", price: 7200 }
    ]
  },
  {
    id: "wire-001",
    title: "Havells Life Line FR-LSH House Wire (Length 90m)",
    retailprice: 1599,
    wholesaleprice: 1399,
    images: ["https://images.unsplash.com/photo-1563770660941-20978e870e26?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Electrical",
    unit: "PIECE",
    currentQty: 250,
    description: "Havells Life Line is a premium range of building wires.",
    variants: [
      { size: "1.0 Sqmm", price: 1299 },
      { size: "1.5 Sqmm", price: 1599 },
      { size: "2.5 Sqmm", price: 2499 }
    ]
  },
  {
    id: "lock-001",
    title: "Godrej Brass Nav-Tal Padlock 6-Levers with 3 Keys",
    retailprice: 799,
    wholesaleprice: 699,
    images: ["https://images.unsplash.com/photo-1618220179428-22790b461013?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Hardware & Locks",
    unit: "PIECE",
    currentQty: 180,
    description: "The iconic Godrej Nav-Tal padlock has been safeguarding houses.",
    variants: [
      { size: "50mm Size", price: 650 },
      { size: "65mm Size", price: 799 },
      { size: "85mm Giant", price: 1199 }
    ]
  },
  {
    id: "paint-001",
    title: "Asian Paints Apex Ultima Exterior Emulsion White",
    retailprice: 3200,
    wholesaleprice: 2890,
    images: ["https://images.unsplash.com/photo-1595206133361-b1fe343e5e23?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Paint",
    unit: "LITRE",
    currentQty: 90,
    description: "Asian Paints Apex Ultima is a premium water-based exterior paint.",
    variants: [
      { size: "4 Litre", price: 1450 },
      { size: "10 Litre", price: 3200 },
      { size: "20 Litre", price: 5900 }
    ]
  },
  {
    id: "pipe-001",
    title: "Supreme PVC Pressure Pipe 4 Inch Class-3 (6m)",
    retailprice: 499,
    wholesaleprice: 420,
    images: ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Plumbing Fitting",
    unit: "PIECE",
    currentQty: 300,
    description: "Supreme Class-3 PVC Pressure Pipes are manufactured for durability.",
    variants: [
      { size: "3 Inch Pipe", price: 399 },
      { size: "4 Inch Pipe", price: 499 }
    ]
  },
  {
    id: "rebar-001",
    title: "Tata Tiscon TMT Steel Rebar Fe 550D High Strength",
    retailprice: 850,
    wholesaleprice: 760,
    images: ["https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Building Material (Cement, Sand, Iron)",
    unit: "PIECE",
    currentQty: 120,
    description: "Tata Tiscon Fe 550D is a high-strength thermo-mechanically treated steel rebar.",
    variants: [
      { size: "10mm (per rod)", price: 650 },
      { size: "12mm (per rod)", price: 850 },
      { size: "16mm (per rod)", price: 1450 }
    ]
  },
  {
    id: "faucet-001",
    title: "Cera Brass Designer Basin Faucet (Chrome Finish)",
    retailprice: 1799,
    wholesaleprice: 1499,
    images: ["https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop"],
    categoryName: "Plumbing Fitting",
    unit: "PIECE",
    currentQty: 80,
    description: "Bring a touch of modern luxury with Cera Brass Faucet.",
    variants: [
      { size: "Standard Cold", price: 1799 },
      { size: "Quarter Turn Mixer", price: 2999 }
    ]
  }
];

async function main() {
  try {
    const shopkeeper = await prisma.shopkeeper.findFirst();
    if (!shopkeeper) {
      console.error("No shopkeeper found in the database. Please create a shopkeeper account first.");
      return;
    }
    console.log("Using shopkeeper:", shopkeeper.shopname, "(id:", shopkeeper.id, ")");

    for (const prod of FALLBACK_PRODUCTS) {
      // 1. Find or create category
      let category = await prisma.category.findFirst({
        where: { title: prod.categoryName }
      });
      if (!category) {
        category = await prisma.category.create({
          data: {
            title: prod.categoryName,
            image: prod.images[0],
            shopkeeperId: shopkeeper.id
          }
        });
        console.log("Created category:", prod.categoryName);
      }

      // 2. Upsert Item
      await prisma.item.upsert({
        where: { id: prod.id },
        update: {
          title: prod.title,
          images: prod.images,
          wholesaleprice: prod.wholesaleprice,
          retailprice: prod.retailprice,
          unit: prod.unit,
          description: prod.description,
          currentQty: prod.currentQty,
          variants: prod.variants,
          shopkeeperId: shopkeeper.id,
          categoryId: category.id
        },
        create: {
          id: prod.id,
          title: prod.title,
          images: prod.images,
          wholesaleprice: prod.wholesaleprice,
          retailprice: prod.retailprice,
          unit: prod.unit,
          description: prod.description,
          currentQty: prod.currentQty,
          variants: prod.variants,
          shopkeeperId: shopkeeper.id,
          categoryId: category.id
        }
      });
      console.log("Upserted item:", prod.title);
    }
    console.log("Seeding successfully completed!");
  } catch (error) {
    console.error("Seeding error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
