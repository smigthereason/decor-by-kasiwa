import type {
  StructureBuilder,
  StructureResolver,
} from "sanity/structure";

const singleton = (
  S: StructureBuilder,
  typeName: string,
  title: string,
) =>
  S.listItem()
    .title(title)
    .id(typeName)
    .child(
      S.document()
        .schemaType(typeName)
        .documentId(typeName),
    );

export const structure: StructureResolver = (
  S: StructureBuilder,
) =>
  S.list()
    .title("Content")
    .items([
      S.documentTypeListItem("product").title("Products"),
      S.documentTypeListItem("collection").title("Collections"),
      S.documentTypeListItem("category").title("Categories"),
      S.documentTypeListItem("shopSpace").title("Shop by Space"),
      S.documentTypeListItem("shopStyle").title("Shop by Style"),

      S.divider(),

      S.documentTypeListItem("customerUser").title("Customers"),

      S.divider(),

      S.documentTypeListItem("project").title(
        "Portfolio Projects",
      ),
      S.documentTypeListItem("service").title("Services"),
      S.documentTypeListItem("consultation").title(
        "Consultation Enquiries",
      ),

      S.divider(),

      singleton(S, "branding", "Logo & Branding"),
      singleton(S, "siteSettings", "Site Settings"),
    ]);
