"use client";

import { useEffect, useMemo } from "react";
import { setIfMissing, type StringInputProps, useFormValue } from "sanity";
import { generateProductSku } from "../lib/sku";

export function AutoSkuInput(props: StringInputProps) {
  const productName = useFormValue(["name"]);
  const documentId = useFormValue(["_id"]);

  const currentSku = typeof props.value === "string" ? props.value.trim() : "";
  const name = typeof productName === "string" ? productName.trim() : "";
  const id = typeof documentId === "string" ? documentId : "";

  const generatedSku = useMemo(
    () => (name && id ? generateProductSku(name, id) : ""),
    [name, id],
  );

  useEffect(() => {
    // Never overwrite a manually entered or previously generated SKU.
    if (!currentSku && generatedSku) {
      props.onChange(setIfMissing(generatedSku));
    }
  }, [currentSku, generatedSku, props.onChange]);

  return props.renderDefault({
    ...props,
    elementProps: {
      ...props.elementProps,
      placeholder: generatedSku || "Generated automatically from the product",
    },
  });
}
